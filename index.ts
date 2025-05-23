import { Room, type BunSocket, type PayloadsFromClients, type PayloadsFromServer } from "./Room";

const port = process.env.PORT || 8080;
const rootPath = process.env.ROOT_PATH || "/";

const HEARTBEAT_INTERVAL = 30e3; // 30 seconds
const PING_PACKET = JSON.stringify({
  type: "ping",
} satisfies PayloadsFromServer)

const rooms = new Map<string, Room>();
const socketsStatus: Record<string, { socket: BunSocket, isAlive: boolean }> = {};

function generateClientId () {
  return crypto.randomUUID();
}

Bun.serve({
  port,
  async fetch (req, server) {
    const reqUrl = new URL(req.url);

    // Prevent access to anything other than the root path
    if (req.method !== "GET" || rootPath !== reqUrl.pathname.replace(/\/$/, "")) {
      return new Response("Not found", { status: 404 });
    }

    const clientId = generateClientId();
    const params = reqUrl.searchParams;

    const data = {
      roomId: params.get("room"),
      password: params.get("password"),
      name: params.get("name"),
    }

    if (!data.roomId) {
      return new Response("Missing roomId", { status: 400 });
    }
    if (!data.password) {
      return new Response("Missing password", { status: 400 });
    }
    if (!data.name) {
      return new Response("Missing name", { status: 400 });
    }

    // check if the room exists
    const room = rooms.get(data.roomId);
    if (room && room.password !== data.password) {
      return new Response("Incorrect password", { status: 401 });
    }

    if (!room) {
      // create a new room if it doesn't exist
      rooms.set(data.roomId, new Room(data.roomId, data.password));
    }

    // check if the clientId already exists
    for (const [roomId, room] of rooms) {
      for (const [id, client] of room.clients) {
        if (clientId === id) {
          return new Response("Client ID already exists", { status: 400 });
        }
      }
    }

    // upgrade the request to a WebSocket
    if (server.upgrade(req, { data: { clientId, ...data } })) {
      return; // do not return a Response
    }
    return new Response("Upgrade failed", { status: 500 });
  },

  websocket: {
    open (ws: BunSocket) {
      socketsStatus[ws.data.clientId] = { socket: ws, isAlive: true };
      const room = rooms.get(ws.data.roomId);
      if (!room) {
        ws.send(JSON.stringify({ type: "error", message: "Room not found" } satisfies PayloadsFromServer));
        return;
      }

      ws.send(JSON.stringify({ type: "init", clientId: ws.data.clientId } satisfies PayloadsFromServer));

      room.addClient({
        socket: ws,
        id: ws.data.clientId,
      });
    },

    message (ws: BunSocket, msg) {
      socketsStatus[ws.data.clientId].isAlive = true; // mark the client as alive
      let data: PayloadsFromClients;

      try {
        data = JSON.parse(msg.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      const clientId = ws.data.clientId;
      const currentRoom: Room | undefined = rooms.get(ws.data.roomId);

      switch (data.type) {
        case "change_name": {
          if (!currentRoom) {
            ws.send(JSON.stringify({ type: "error", message: "Join a room first" } satisfies PayloadsFromServer));
            return;
          }
          const newName = data.text;
          ws.data.name = newName;
          currentRoom.updateAllClientsWithList();
          break;
        }

        case "share": {
          if (!currentRoom) {
            ws.send(JSON.stringify({ type: "error", message: "Join a room first" } satisfies PayloadsFromServer));
            return;
          }
          currentRoom.broadcast(clientId, data.text);
          break;
        }

        case "whisper": {
          if (!currentRoom || !data.to || !data.text) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid whisper" } satisfies PayloadsFromServer));
            return;
          }
          currentRoom.whisper(clientId, data.to, data.text);
          break;
        }

        case "pong": {
          // do nothing
          break;
        }

        default:
          ws.send(JSON.stringify({ type: "error", message: "Unknown message type" } satisfies PayloadsFromServer));
      }
    },

    close (ws: BunSocket) {
      delete socketsStatus[ws.data.clientId];
      const room: Room | undefined = rooms.get(ws.data.roomId);
      const clientId = ws.data.clientId;
      if (room && clientId) {
        room.removeClient(clientId);
        if (room.clients.size === 0) {
          rooms.delete(room.name);
        }
      }
    },
  },
});

function ping (ws: BunSocket) {
  ws.send(PING_PACKET);
}

setInterval(() => {
  // console.log('firing interval');
  for (const client of Object.values(socketsStatus)) {
    if (!client.isAlive) {
      client.socket.terminate();
      return;
    }

    client.isAlive = false;
    ping(client.socket);
  }
}, HEARTBEAT_INTERVAL);

console.log(`✅ WebSocket server running at ws://localhost:${port}`);
