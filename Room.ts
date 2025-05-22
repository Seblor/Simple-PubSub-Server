export type PayloadsFromClients = {
  type: "change_name",
  text: string;
} | {
  type: "share",
  text: string;
} | {
  type: "whisper",
  to: string;
  text: string;
} | {
  type: "error",
  message: string;
};

export type PayloadsFromServer = {
  type: "share",
  from: string;
  text: string;
} | {
  type: "whisper",
  from: string;
  text: string;
} | {
  type: "error",
  message: string;
} | {
  type: "init",
  clientId: string;
} | {
  type: "client_list",
  clients: Array<{ id: string; name: string }>;
};

export type BunSocket = Bun.ServerWebSocket<unknown> & {
  data: {
    clientId: string;
    roomId: string;
    password: string;
    name: string;
  }
};

export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export type Client = {
  socket: BunSocket;
  id: string; // unique identifier
};

export class Room {
  name: string;
  password: string;
  clients: Map<string, Client>;

  constructor(name: string, password: string) {
    this.name = name;
    this.password = password;
    this.clients = new Map();
  }

  addClient (newClient: Client) {
    this.clients.set(newClient.id, newClient);

    this.updateAllClientsWithList();
  }

  removeClient (clientId: string) {
    this.clients.delete(clientId);

    this.updateAllClientsWithList();
  }

  updateAllClientsWithList () {
    const clientsList = this.getClientList();
    for (const [, client] of this.clients) {
      client.socket.send(JSON.stringify({ type: "client_list", clients: clientsList } satisfies PayloadsFromServer));
    }
  }

  broadcast (senderId: string, text: string) {
    for (const [id, client] of this.clients) {
      if (id !== senderId && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(
          JSON.stringify({
            type: "share",
            from: senderId,
            text,
          } satisfies PayloadsFromServer)
        );
      }
    }
  }

  whisper (fromId: string, toId: string, text: string) {
    const target = this.clients.get(toId);
    if (target && target.socket.readyState === WebSocket.OPEN) {
      target.socket.send(
        JSON.stringify({
          type: "whisper",
          from: fromId,
          text,
        } satisfies PayloadsFromServer)
      );
    }
  }

  getClientList (): Extract<PayloadsFromServer, { type: "client_list" }>["clients"] {
    return Array.from(this.clients.keys()).map((clientId) => {
      const client = this.clients.get(clientId);
      return {
        id: clientId,
        name: client?.socket.data.name || "Unknown",
      };
    });
  }
}
