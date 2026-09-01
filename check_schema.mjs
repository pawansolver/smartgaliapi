import db from './src/config/db.js';
await db.authenticate();

const [cols] = await db.query("DESCRIBE posts");
console.log("POSTS TABLE:");
cols.forEach(c => console.log(`  ${c.Field}: ${c.Type} NULL=${c.Null} Default=${c.Default}`));

const [mcols] = await db.query("DESCRIBE media_files");
console.log("\nMEDIA_FILES TABLE:");
mcols.forEach(c => console.log(`  ${c.Field}: ${c.Type} NULL=${c.Null} Default=${c.Default}`));

await db.close();
