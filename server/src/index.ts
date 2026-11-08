import { createApp } from "./app.js";
import { config } from "./config.js";
import { createPool } from "./db/pool.js";

const app = await createApp(createPool(), config.webDir);

app.listen(config.port, () => {
  console.log(`Listening on http://localhost:${config.port}`);
});
