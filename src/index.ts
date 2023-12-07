import express from 'express';
import bodyParser from 'body-parser';
import { IncomingMessage, createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import cors from 'cors';
import scheduler from 'node-schedule';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Prisma, PrismaClient, ScheduledSwitch, SmartDevices } from '@prisma/client';

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
    const deviceId: string = req.params.uid;

    const device = await database.smartDevices.findUnique({
        where: {
            deviceId: deviceId
        }
    });

    if (!device) return res.status(400).json({
        error: 'Device not found.',
        timestamp: new Date().toISOString()
    })

    const token = jwt.sign({ deviceId: device.deviceId }, process.env.SECRET as string, { algorithm: 'HS256', expiresIn: '24h' });

    return res.status(200).json({
        id: device.deviceId,
        token: token
    })
});

// =============================== DEVICE STATUSES ========================= //

interface StatusReport {
    deviceId: string;
    status: number;
}

app.post('/status', async (req, res) => {
    const status: StatusReport = req.body;

    try {
        const device =  await database.smartDevices.update({
            where: {
                deviceId: status.deviceId,
            },
            data: {
                deviceStatus: status.status > 0 ? false : true,
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
    const target = new Date(req.params.timestamp);

    try {
        const previous = new Date(target);
        previous.setDate(previous.getDate() - 1);

        const current = new Date(target);

        const reports = await database.energyMonitoring.findMany({
            where: {
                recordedAt: {
                    gte: previous,
                    lte: current
                }
            },
            orderBy: {
                recordedAt: 'desc'
            }
        });

        if (reports.length === 0) return res.status(200).json({
            power: 0,
            current: 0,
            voltage: 0,
            energy: 0,
            frequency: 0,
            powerFactor: 0,
            recordedAt: 0,
            consumption: 0,
            cost: 0
        });

        const sorted = reports.sort((a, b) => b.energy.toNumber() - a.energy.toNumber());
        const consumption = sorted[0].energy.toNumber() - sorted[sorted.length - 1].energy.toNumber();
        const cost = consumption * 12.00;

        return res.status(200).json({
            power: reports[0].power.toNumber(),
            current: reports[0].current.toNumber(),
            voltage: reports[0].voltage.toNumber(),
            energy: reports[0].energy.toNumber(),
            frequency: reports[0].frequency.toNumber(),
            powerFactor: reports[0].powerFactor.toNumber(),
            recordedAt: reports[0].recordedAt.toISOString(),
            consumption: consumption,
            cost: cost
        })
    } catch (err) {
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
})

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

wss.on('connection', function connection(ws: WebSocket, deviceId: string) {
    ws.on('error', console.error);
  
    ws.on('message', function message(data) {
        const message: SocketMessage = JSON.parse(data.toString());

        // if action is status send command
        if (message.action === "STATUS") {
            database.smartDevices.update({
                where: {
                    deviceId: message.recipient,
                },
                data: {
                    deviceStatus: message.value > 0 ? false : true,
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
                    deviceTimer: true
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
                    // turn the device off
                    database.smartDevices.update({
                        where: {
                            deviceId: message.recipient,
                        },
                        data: {
                            deviceStatus: false,
                            deviceTimer: false
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

            // turn the device off
            database.smartDevices.update({
                where: {
                    deviceId: message.recipient,
                },
                data: {
                    deviceStatus: false,
                    deviceTimer: false
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
    });
});

function authenticate(request: IncomingMessage): string | null {
    const token = request.headers.authorization;

    if (!token) return null;

    const payload = jwt.verify(token.split('Bearer ')[1], process.env.SECRET as string);
    return (payload as SmartDevices).deviceId;
}

server.on('upgrade', function upgrade(request, socket, head) {
    socket.on('error', (err) => {
        console.log(err)
    });

    const deviceId = authenticate(request);

    if (!deviceId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }
  
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
                        deviceStatus: true
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
                database.smartDevices.update({
                    where: {
                        deviceId: devices[i].deviceId
                    },
                    data: {
                        deviceStatus: false
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
});


const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
    console.log(`Server is now running on http://localhost:${PORT}`);
});