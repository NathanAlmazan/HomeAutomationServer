import express from 'express';
import bodyParser from 'body-parser';
import { IncomingMessage, createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { PrismaClient, SmartDevices } from '@prisma/client';

dotenv.config();

// initialize database
const database = new PrismaClient();

// initialize express application
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ======================== HTTP Endpoints ============================ //
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

// initialize websocket server using external http server
const server = createServer(app); 
const wss = new WebSocketServer({ 
    noServer: true 
}); 

// ====================== WebSocket Endpoints ========================= //
interface SocketMessage {
    recipient: string;
    action: "TURN_ON" | "TURN_OFF"
}

wss.on('connection', function connection(ws: WebSocket, deviceId: string) {
    ws.on('error', console.error);
  
    ws.on('message', function message(data) {
        const message: SocketMessage = JSON.parse(data.toString());

        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    sender: deviceId,
                    recipient: message.recipient,
                    action: message.action
                }));
            }
        });
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


const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
    console.log(`Server is now running on http://localhost:${PORT}`);
});