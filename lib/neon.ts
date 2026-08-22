import { createClient } from "@neondatabase/neon-js";

export type PlayerAccount = {
  id: string;
  email: string;
  name?: string | null;
};

export type GameSessionRecord = {
  id: number;
  played_at: string;
  result: "won" | "lost";
  survival_seconds: number;
  batteries_collected: number;
  noise_events: number;
  hiding_seconds: number;
  flashlight_seconds: number;
  rooms_visited: number;
};

export const neon = createClient({
  auth: {
    url: "https://ep-green-queen-au4wc86a.neonauth.c-10.us-east-1.aws.neon.tech/neondb/auth",
  },
  dataApi: {
    url: "https://ep-green-queen-au4wc86a.apirest.c-10.us-east-1.aws.neon.tech/neondb/rest/v1",
  },
});
