import { WebSocket, WebSocketServer } from "ws";

const ws = new WebSocketServer({port: 8080});

let userCount = 0 ;

ws.on("connection" , (socket) => {
    console.log("New client connected");
    userCount++;
    console.log(`Total users connected: ${userCount}`);

    socket.on("message" , (message) => {

        console.log(`Received message: ${message}`);
        
    })
})