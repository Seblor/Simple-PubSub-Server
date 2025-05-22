// This is an example client

/**
 * Example of RequestType type:
 * 
 * type RequestTypeExample = {
 *     type: "Query";
 *     payload: {
 *         id: string;
 *         command: string;
 *     };
 * } | {
 *     type: "Response";
 *     payload: {
 *         id: string;
 *         payload: string;
 *     };
 * } 
 */

/**
 * The PayloadsFromClients type defines the structure of messages sent from clients to the server.
 */
export type PayloadsFromClients = {
  type: "pong"
} | {
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

/**
 * The PayloadsFromServer type defines the structure of messages sent from the server to clients.
 */
export type PayloadsFromServer = {
  type: "ping"
} | {
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

type EventHandler<T extends PayloadsFromServer["type"]> = (payload: Extract<PayloadsFromServer, { type: T }>) => void;

export class PubSubClient<RequestType> {
  private socket: WebSocket | null = null;
  private eventHandlers: { [K in PayloadsFromServer["type"]]: EventHandler<K>[] } = {
    share: [],
    whisper: [],
    client_list: [],
    error: [],
    init: [],
    ping: [],
  };
  public clientId: string | null = null;
  public peers: Array<{
    id: string;
    name: string;
  }> = [];

  private url = "";
  private room = "";
  private password = "";
  private clientName = "";

  connect (
    url: string,
    room: string,
    password: string,
    clientName: string
  ) {
    this.url = url;
    this.room = room;
    this.password = password;
    this.clientName = clientName;

    this.socket = new WebSocket(`${this.url}/?room=${encodeURIComponent(this.room)}&password=${encodeURIComponent(this.password)}&name=${encodeURIComponent(this.clientName)}`);

    this.socket.addEventListener("message", (event) => {
      let data: PayloadsFromServer;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (data.type) {
        case "ping":
          this.send({ type: "pong" });
          break;
        case "init":
          this.clientId = data.clientId;
          break;
        case "client_list":
          this.peers = data.clients;
          break;
        case "share":
          break;
        case "whisper":
          break;
        case "error":
          console.error(data.message);
          break;
      }
      this.trigger(data.type, data);
    });

    this.socket.addEventListener("close", () => {
      console.warn("Connection closed. Attempting to reconnect...");
      setTimeout(() => {
        this.connect(this.url, this.room, this.password, this.clientName);
      }, 1e3); // Retry after 1 second
    });

    this.socket.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
      this.socket?.close(); // Ensure the socket is closed on error
    });
  }

  public send (payload: PayloadsFromClients) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  public sendMessage (message: RequestType) {
    this.sendStringMessage(JSON.stringify(message));
  }

  private sendStringMessage (text: string) {
    this.send({ type: "share", text });
  }

  public whisper (toClientId: string, text: RequestType) {
    this.whisperString(toClientId, JSON.stringify(text));
  }

  private whisperString (toClientId: string, text: string) {
    this.send({ type: "whisper", to: toClientId, text });
  }

  public on<T extends PayloadsFromServer["type"] = PayloadsFromServer["type"]> (event: T, handler: (payload: Extract<PayloadsFromServer, { type: T }>) => void) {
    this.eventHandlers[event].push(handler);
  }

  private trigger<T extends PayloadsFromServer["type"]> (event: T, payload: Extract<PayloadsFromServer, { type: T }>) {
    for (const handler of this.eventHandlers[event] || []) {
      handler(payload);
    }
  }

  public close () {
    this.socket?.close();
    this.socket = null;
    this.clientId = null;
    this.peers = [];
    this.url = "";
    this.clientName = "";
    this.room = "";
    this.password = "";
  }
}
