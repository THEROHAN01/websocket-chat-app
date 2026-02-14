import { WebSocket, WebSocketServer } from "ws";

const wss = new WebSocketServer({port: 8080});

let userCount = 0 ;
let allSockets: WebSocket[] = [] ;


wss.on("connection" , (socket) => {

    allSockets.push(socket); // storing all the sockets in an array to send message to 

    console.log("New client connected");
    userCount++;
    console.log(`Total users connected: ${userCount}`);
    
    socket.on("message" , (message) => {
        for(const socket of allSockets ) {
            socket.send(message.toString() + ": message from the server");
       }
        console.log(`Received message: ${message}`);

    })
})