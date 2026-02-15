import { WebSocket, WebSocketServer } from "ws";

const wss = new WebSocketServer({
    port: 8081,
    host: '0.0.0.0'
});

interface User {
    socket : WebSocket ;
    room : string;
}


let userCount = 0 ;
let allSockets: User[] = [] ;

// Log when server starts
wss.on('listening', () => {
    console.log('✓ WebSocket server is listening on ws://localhost:8081');
    console.log('✓ Server is ready to accept connections');
});

wss.on('error', (error) => {
    console.error('✗ WebSocket server error:', error);
});

wss.on("connection" , (socket) => {
    userCount++;
    console.log(`Total users connected: ${userCount}`);
    
    socket.on("message" , (message) => {
        
        const parsedMessage = JSON.parse(message.toString());
        console.log(parsedMessage);
        if(parsedMessage.type == "join"){
            allSockets.push({
                socket:  socket,
                room: parsedMessage.payload.roomId
            })
        }

        if(parsedMessage.type == "chat"){
            const currentUserRoom = allSockets.find((x) => (x.socket) == socket )?.room

            for(const user of allSockets){
                if(user.room == currentUserRoom){
                    user.socket.send(parsedMessage.payload.message)
                }
            }
        }
    })
})