import { migrate, closeDB } from './db.js';
await migrate();
console.info('Database migrations applied.');
await closeDB();
