"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const http_1 = require("http");
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
dotenv_1.default.config();
// initialize database
const database = new client_1.PrismaClient();
// initialize express application
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
app.use(body_parser_1.default.urlencoded({ extended: true }));
// ======================== HTTP Endpoints ============================ //
app.post('/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const device = req.body;
    // generate password
    const password = (Math.random() + 1).toString(36).substring(7);
    try {
        const registered = yield database.smartDevices.create({
            data: {
                deviceName: device.deviceName,
                devicePass: password
            }
        });
        return res.status(200).json(registered);
    }
    catch (err) {
        return res.status(400).json({
            error: err,
            timestamp: new Date().toISOString()
        });
    }
}));
app.get('/login/:uid', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const deviceId = req.params.uid;
    const device = yield database.smartDevices.findUnique({
        where: {
            deviceId: deviceId
        }
    });
    if (!device)
        return res.status(400).json({
            error: 'Device not found.',
            timestamp: new Date().toISOString()
        });
    const token = jsonwebtoken_1.default.sign({ deviceId: device.deviceId }, process.env.SECRET, { algorithm: 'HS256', expiresIn: '24h' });
    return res.status(200).json({
        id: device.deviceId,
        token: token
    });
}));
// initialize websocket server using external http server
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({
    noServer: true
});
wss.on('connection', function connection(ws, deviceId) {
    ws.on('error', console.error);
    ws.on('message', function message(data) {
        const message = JSON.parse(data.toString());
        wss.clients.forEach(function each(client) {
            if (client !== ws && client.readyState === ws_1.WebSocket.OPEN) {
                client.send(JSON.stringify({
                    sender: deviceId,
                    recipient: message.recipient,
                    action: message.action
                }));
            }
        });
    });
});
function authenticate(request) {
    const token = request.headers.authorization;
    if (!token)
        return null;
    const payload = jsonwebtoken_1.default.verify(token.split('Bearer ')[1], process.env.SECRET);
    return payload.deviceId;
}
server.on('upgrade', function upgrade(request, socket, head) {
    socket.on('error', (err) => {
        console.log(err);
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
//# sourceMappingURL=index.js.map