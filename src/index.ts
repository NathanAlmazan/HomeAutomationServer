import express from 'express';
import bodyParser from 'body-parser';
import { IncomingMessage, createServer } from 'http';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import cors from 'cors';
import scheduler from 'node-schedule';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Prisma, PrismaClient, ScheduledSwitch, SmartDevices, UserSettings } from '@prisma/client';

dotenv.config();

// initialize database
const database = new PrismaClient();

// initialize timer storage
let timerIds: { [key: string]: NodeJS.Timeout } = {};

// initialize express application
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ======================== HTTP Endpoints ============================ //

// ======================== AUTHENTICATION ============================ //
app.post('/register', async (req, res) => {
    const device: SmartDevices = req.body;

    // generate password
    const password = (Math.random() + 1).toString(36).substring(7);

    try {
        const registered = await database.smartDevices.create({
            data: {
                deviceName: device.deviceName,
                devicePass: password
            }
        });

        return res.status(200).json(registered);
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.get('/login/:uid', async (req, res) => {
    const deviceId = "a2c28669-361a-4a9e-b2f7-955b20e8341f";

    const token = jwt.sign({ deviceId: deviceId }, process.env.SECRET as string, { algorithm: 'HS256', expiresIn: '24h' });

    return res.status(200).json({
        id: deviceId,
        token: token
    })
});

// =============================== DEVICE STATUSES ========================= //

interface StatusReport {
    deviceId: string;
    status: number;
}

async function generateLog(deviceId: string, status: boolean, timestamp: Date) {
    const state = await database.smartDevices.findUnique({
        where: {
            deviceId: deviceId,
        },
        select: {
            deviceId: true,
            deviceName: true,
            deviceStatus: true,
            updatedAt: true
        }
    });

    // monitor outlet consumption
    if (!status && state) {
        if (state.deviceStatus && state.updatedAt) {
            const history = await database.energyMonitoring.aggregate({
                where: {
                    recordedAt: {
                        gte: state.updatedAt,
                        lte: timestamp
                    }
                },
                _sum: {
                    power: true
                }
            });

            if (history._sum.power) {
                await database.deviceLogs.create({
                    data: {
                        deviceId: deviceId,
                        opened: state.updatedAt,
                        closed: timestamp,
                        consumed: history._sum.power,
                        deviceName: state.deviceName
                    }
                })
            }
        }
    }
}

app.post('/status', async (req, res) => {
    const body: StatusReport = req.body;
    const status = body.status > 0 ? false : true;
    const timestamp = new Date();

    try {
        await generateLog(body.deviceId, status, timestamp);

        const device =  await database.smartDevices.update({
            where: {
                deviceId: body.deviceId,
            },
            data: {
                deviceStatus: status,
                updatedAt: timestamp
            }
        });

        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    sender: device.deviceId,
                    recipient: device.deviceId,
                    action: "STATUS",
                    value: device.deviceStatus ? 0 : 1
                }));
            }
        });
    
        return res.status(200).json(device);
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.get('/status/:uid', async (req, res) => {
    try {
        const device = await database.smartDevices.findUnique({
            where: {
                deviceId: req.params.uid
            }
        });
    
        return res.status(200).json(device);
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

// =============================== DEVICE DETAILS ========================= //

app.get('/devices', async (req, res) => {
    try {
        const devices = await database.smartDevices.findMany({
            where: {
                controller: false
            },
            orderBy: {
                outlet: 'asc'
            },
            include: {
                schedules: true
            }
        });
    
        return res.status(200).json(devices.map(device => ({
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            devicePass: device.devicePass,
            deviceCategory: device.deviceCategory,
            deviceStatus: device.deviceStatus,
            controller: device.controller,
            deviceTimer: device.deviceTimer,
            deviceSchedule: device.schedules !== null && device.schedules.active
        })));
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.post('/device/:uid', async (req, res) => {
    const device = req.body as SmartDevices;

    try {
        const devices = await database.smartDevices.update({
            where: {
                deviceId: req.params.uid
            },
            data: {
                deviceName: device.deviceName,
                deviceCategory: device.deviceCategory
            }
        });
    
        return res.status(200).json(devices);
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.get('/device/:uid', async (req, res) => {
    try {
        const device = await database.smartDevices.findUnique({
            where: {
                deviceId: req.params.uid
            }
        });
    
        return res.status(200).json(device);
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.get('/consumption/:uid', async (req, res) => {
    try {
        const consumption = await database.deviceLogs.findMany({
            where: {
                deviceId: req.params.uid
            }
        });
    
        return res.status(200).json(consumption.map(log => ({
            deviceId: log.deviceId,
            deviceName: log.deviceName,
            opened: log.opened.toISOString(),
            closed: log.closed.toISOString(),
            consumed: log.consumed.toNumber(),
        })));
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

// =============================== DEVICE SCHEDULES ========================= //

app.get('/schedule/:uid', async (req, res) => {
    try {
        const schedule = await database.scheduledSwitch.findUnique({
            where: {
                deviceId: req.params.uid
            }
        });

        if (!schedule) {
            return res.status(400).json({
                error: "No Schedule Found",
                timestamp: new Date().toISOString()
            })
        }
    
        return res.status(200).json({ ...schedule, scheduleId: schedule.scheduleId.toString() });
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.post('/schedule/:uid', async (req, res) => {
    const data = req.body as ScheduledSwitch;

    try {
        const schedule = await database.scheduledSwitch.findUnique({
            where: {
                deviceId: req.params.uid
            }
        });

        if (schedule) {
            const updated = await database.scheduledSwitch.update({
                where: {
                    deviceId: req.params.uid
                },
                data: {
                    startHour: data.startHour,
                    startMinute: data.startMinute,
                    endHour: data.endHour,
                    endMinute: data.endMinute,
                    active: true
                }
            });
    
            return res.status(200).json({ ...updated, scheduleId: updated.scheduleId.toString() });
        } else {
            const saved = await database.scheduledSwitch.create({
                data: {
                    deviceId: req.params.uid,
                    startHour: data.startHour,
                    startMinute: data.startMinute,
                    endHour: data.endHour,
                    endMinute: data.endMinute,
                    active: true
                }
            });
    
            return res.status(200).json({ ...saved, scheduleId: saved.scheduleId.toString() });
        }
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.get('/schedule/:uid/stop', async (req, res) => {
    try {
        const updated = await database.scheduledSwitch.update({
            where: {
                deviceId: req.params.uid
            },
            data: {
                active: false
            }
        });

        return res.status(200).json({ ...updated, scheduleId: updated.scheduleId.toString() });
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
})

// =============================== ENERGY REPORT ========================== //

interface EnergyReport {
    power: number;    
    voltage: number;     
    current: number;         
    energy: number;             
    frequency: number            
    powerFactor: number;    
}

app.post('/energy', async (req, res) => {
    const data = req.body as EnergyReport;

    try {
        const report = await database.energyMonitoring.create({
            data: {
                power: new Prisma.Decimal(data.power),
                voltage: new Prisma.Decimal(data.voltage),
                current: new Prisma.Decimal(data.current),
                energy: new Prisma.Decimal(data.energy),
                frequency: new Prisma.Decimal(data.frequency),
                powerFactor: new Prisma.Decimal(data.powerFactor)
            }
        });

        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    sender: "server",
                    recipient: "all",
                    action: "REPORT",
                    value: 1
                }));
            }
        });

        return res.status(200).json({
            reportId: report.recordId.toString(),
            power: report.power.toNumber(),
            current: report.current.toNumber(),
            voltage: report.voltage.toNumber(),
            energy: report.energy.toNumber(),
            frequency: report.frequency.toNumber(),
            powerFactor: report.powerFactor.toNumber(),
            recordedAt: report.recordedAt.toISOString()
        }); 
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.get('/energy/:timestamp', async (req, res) => {
    const target = new Date(parseInt(req.params.timestamp));

    try {
        const settings = await database.userSettings.findUnique({
            where: {
                settingId: 1
            }
        });

        if (!settings) return res.status(400).json({
            error: "Settings not found",
            timestamp: new Date().toISOString()
        });

        const previous = new Date(target.getFullYear(), target.getMonth(), target.getDate());
        previous.setDate(previous.getDate() - 1);

        const current = new Date(target.getFullYear(), target.getMonth(), target.getDate());

        const reports = await database.energyMonitoring.findMany({
            where: {
                recordedAt: {
                    gte: previous.toISOString(),
                    lte: current.toISOString()
                }
            },
            orderBy: {
                recordedAt: 'desc'
            }
        });

        const lastReport = await database.energyMonitoring.findMany({
            orderBy: {
                recordedAt: 'desc'
            },
            take: 2
        })

        if (reports.length === 0) return res.status(200).json({
            power: lastReport[0].power.toNumber(),
            current: lastReport[0].current.toNumber(),
            voltage: lastReport[0].voltage.toNumber(),
            energy: lastReport[0].energy.toNumber(),
            frequency: lastReport[0].frequency.toNumber(),
            powerFactor: lastReport[0].powerFactor.toNumber(),
            recordedAt: lastReport[0].recordedAt.toISOString(),
            consumption: 0,
            cost: 0
        });

        const energyReports = reports.map(r => r.energy.toNumber());
        const consumption = Math.max(...energyReports) - Math.min(...energyReports);
        const cost = consumption * settings.costPerWatt.toNumber();

        return res.status(200).json({
            power: lastReport[0].power.toNumber(),
            current: lastReport[0].current.toNumber(),
            voltage: lastReport[0].voltage.toNumber(),
            energy: lastReport[0].energy.toNumber(),
            frequency: lastReport[0].frequency.toNumber(),
            powerFactor: lastReport[0].powerFactor.toNumber(),
            recordedAt: lastReport[0].recordedAt.toISOString(),
            consumption: consumption,
            cost: cost
        })
    } catch (err) {
        console.log(err);
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.post('/cost', async (req, res) => {
    const data: UserSettings = req.body;
    
    try {
        const settings = await database.userSettings.update({
            where: {
                settingId: 1
            },
            data: {
                costPerWatt: data.costPerWatt,
                maxWattPerDay: data.maxWattPerDay,
                frequency: data.frequency
            }
        })

        return res.status(200).json({
            costPerWatt: settings.costPerWatt.toNumber(),
            maxWattPerDay: settings.maxWattPerDay.toNumber(),
            frequency: settings.frequency
        })
    } catch (err) {
        console.log(err);
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

app.get('/cost', async (req, res) => {
    try {
        const settings = await database.userSettings.findUnique({
            where: {
                settingId: 1
            }
        });

        if (!settings) return res.status(400).json({
            error: "Settings not found",
            timestamp: new Date().toISOString()
        });

        return res.status(200).json({
            costPerWatt: settings.costPerWatt.toNumber(),
            maxWattPerDay: settings.maxWattPerDay.toNumber(),
            frequency: settings.frequency
        })
    } catch (err) {
        console.log(err);
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

interface EnergySummary {
    month: number;
    consumption: number;
}

app.get('/energy', async (req, res) => {
    try {
        const summary: EnergySummary[] = await database.$queryRaw`SELECT EXTRACT(MONTH FROM "recordedAt") AS month,
                                                    MAX(energy) - MIN(energy) AS consumption
                                                FROM
                                                    public."EnergyMonitoring"
                                                GROUP BY
                                                    EXTRACT(MONTH FROM "recordedAt")
                                                ORDER BY
                                                    EXTRACT(MONTH FROM "recordedAt") DESC;`

        return res.status(200).json(summary);
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

// consumption history
app.get('/history/:frequency', async (req, res) => {
    try {
        const frequency = req.params.frequency;
        const frequencies = ['hour', 'day', 'week', 'month'];

        if (!frequencies.includes(frequency)) return res.status(400).json({
            error: "Invalid frequency",
            timestamp: new Date().toISOString()
        });

        const history = await database.$queryRaw`
                            SELECT
                                DATE_TRUNC(${frequency}, "recordedAt") AS stamp,
                                SUM("energy") AS energy      
                            FROM
                                public."EnergyMonitoring"
                            GROUP BY
                                stamp
                            ORDER BY
                                stamp`;

        return res.status(200).json(history);
    } catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        })
    }
});

// initialize websocket server using external http server
const server = createServer(app); 
const wss = new WebSocketServer({ 
    noServer: true 
}); 
// ====================== WebSocket Endpoints ========================= //
interface SocketMessage {
    recipient: string;
    action: "STATUS" | "TIMER";
    value: number;
}

function isJSON(data: RawData) {
    try {
        JSON.parse(data.toString());
        return true;
    } catch (error) {
        return false;
    }
}

wss.on('connection', function connection(ws: WebSocket, deviceId: string) {
    ws.on('error', console.error);
  
    ws.on('message', function message(data) {
        if (isJSON(data)) {
            const message: SocketMessage = JSON.parse(data.toString());

            // if action is status send command
            if (message.action === "STATUS") {
                const status = message.value > 0 ? false : true
                const timestamp = new Date();

                generateLog(message.recipient, status, timestamp)
                    .catch(err => console.log(err));

                database.smartDevices.update({
                    where: {
                        deviceId: message.recipient,
                    },
                    data: {
                        deviceStatus: status,
                        updatedAt: timestamp
                    }
                })
                .then(() => {
                    wss.clients.forEach(function each(client) {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                sender: deviceId,
                                recipient: message.recipient,
                                action: message.action,
                                value: message.value
                            }));
                        }
                    });
                })
                .catch((err) => console.log(err));

            // if action is timer...
            } else if (message.action === "TIMER") {
                // turn device on
                database.smartDevices.update({
                    where: {
                        deviceId: message.recipient,
                    },
                    data: {
                        deviceStatus: true,
                        deviceTimer: true,
                        updatedAt: new Date()
                    }
                })
                .then(() => {
                    wss.clients.forEach(function each(client) {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                sender: deviceId,
                                recipient: message.recipient,
                                action: message.action,
                                value: 0
                            }));
                        }
                    });

                    // wait for defined time
                    const timer = setTimeout(() => {
                        const timestamp = new Date();

                        generateLog(message.recipient, false, timestamp)
                            .catch(err => console.log(err));

                        // turn the device off
                        database.smartDevices.update({
                            where: {
                                deviceId: message.recipient,
                            },
                            data: {
                                deviceStatus: false,
                                deviceTimer: false,
                                updatedAt: timestamp
                            }
                        })
                        .then(() => {
                            wss.clients.forEach(function each(client) {
                                if (client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        sender: deviceId,
                                        recipient: message.recipient,
                                        action: message.action,
                                        value: 1
                                    }));
                                }
                            });
                        })
                        .catch((err) => console.log(err));
                    }, message.value);

                    timerIds[message.recipient] = timer;
                })
                .catch((err) => console.log(err));
            } else if (message.action === "TIMER_STOP") {
                clearTimeout(timerIds[message.recipient]);
                
                const timestamp = new Date();

                generateLog(message.recipient, false, timestamp)
                    .catch(err => console.log(err));

                // turn the device off
                database.smartDevices.update({
                    where: {
                        deviceId: message.recipient,
                    },
                    data: {
                        deviceStatus: false,
                        deviceTimer: false,
                        updatedAt: timestamp
                    }
                })
                .then(() => {
                    wss.clients.forEach(function each(client) {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                sender: deviceId,
                                recipient: message.recipient,
                                action: message.action,
                                value: 1
                            }));
                        }
                    });
                })
                .catch((err) => console.log(err));
            }
        } else {
            const base64String = Buffer.from(data as Buffer).toString('base64');

            wss.clients.forEach(function each(client) {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        sender: deviceId,
                        recipient: base64String,
                        action: "VIDEO",
                        value: 0
                    }));
                }
            });
        }
    });
});

function authenticate(request: IncomingMessage): string | null {
    try {
        const token = request.headers.authorization;

        if (!token) return null;

        const payload = jwt.verify(token.split('Bearer ')[1], process.env.SECRET as string);
        return (payload as SmartDevices).deviceId;
    } catch (err) {
        console.error(err);
        return null;
    }
}

server.on('upgrade', function upgrade(request, socket, head) {
    socket.on('error', (err) => {
        console.log(err)
    });

    const deviceId = "a2c28669-361a-4a9e-b2f7-955b20e8341f";
  
    socket.removeListener('error', (err) => {
        console.log(err);
    });

    wss.handleUpgrade(request, socket, head, function done(ws) {
        wss.emit('connection', ws, deviceId);
    });
});

// =========================== SCHEDULED JOBS ============================ //
const job = scheduler.scheduleJob('* * * * *', function() {
    console.log('Job Executed.');

    database.scheduledSwitch.findMany({
        where: {
            active: true
        }
    })
    .then(devices => {
        
        for (let i = 0; i < devices.length; i++) {
            const start = new Date(2020, 12, 25, devices[i].startHour, devices[i].startMinute);
            const end = new Date(2020, 12, 25, devices[i].endHour, devices[i].endMinute);
            const marker = new Date(2020, 12, 25, new Date().getHours(), new Date().getMinutes());
            marker.setHours(marker.getHours() + 8);
            const cursor = new Date(2020, 12, 25, marker.getHours(), marker.getMinutes());

            if (start.getTime() <= cursor.getTime() && end.getTime() >= cursor.getTime()) {
                database.smartDevices.update({
                    where: {
                        deviceId: devices[i].deviceId
                    },
                    data: {
                        deviceStatus: true,
                        updatedAt: new Date()
                    }
                })
                .then(device => {
                    wss.clients.forEach(function each(client) {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                sender: device.deviceId,
                                recipient: device.deviceId,
                                action: "STATUS",
                                value: 0
                            }));
                        }
                    });
                })
                .catch(err => console.log(err));
            } else {
                const timestamp = new Date();

                generateLog(devices[i].deviceId, false, timestamp)
                    .catch(err => console.log(err));

                database.smartDevices.update({
                    where: {
                        deviceId: devices[i].deviceId
                    },
                    data: {
                        deviceStatus: false,
                        updatedAt: timestamp
                    }
                })
                .then(device => {
                    wss.clients.forEach(function each(client) {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                sender: device.deviceId,
                                recipient: device.deviceId,
                                action: "STATUS",
                                value: 1
                            }));
                        }
                    });
                })
                .catch(err => console.log(err));
            }
        }
    })
    .catch(err => console.log(err));

    database.energyMonitoring.findFirst({
        orderBy: {
            recordedAt: 'desc'
        },
        select: {
            recordedAt: true
        }
    })
    .then(lastRecord => {
        if (lastRecord) {
            const now = new Date();
            const diff = now.getTime() - lastRecord.recordedAt.getTime();

            if (diff > 5000) {
                wss.clients.forEach(function each(client) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            sender: "server",
                            recipient: "all",
                            action: "DISCONNECTED",
                            value: 0
                        }));
                    }
                });
            }
        }
    })
    .catch(err => console.log(err));
});


const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
    console.log(`Server is now running on http://localhost:${PORT}`);
});
