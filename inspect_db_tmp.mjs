import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'srv1100.hstgr.io', user: 'u963801592_smartgaliU', 
  password: 'SmartGali232026', database: 'u963801592_SmartGali', port: 3306
});

const tables = ['society_complaints','society_members','complaint_categories','complaint_sub_categories','service_provider_profiles','society_audit_logs'];
for (const t of tables) {
  const [cols] = await conn.query('DESCRIBE ' + t);
  console.log('\n=== ' + t + ' ===');
  console.log(cols.map(c => c.Field + ' ' + c.Type + (c.Null==='NO'?' NOT NULL':'')).join('\n'));
}

const [catRows] = await conn.query('SELECT * FROM complaint_categories LIMIT 20');
console.log('\n=== complaint_categories DATA ===');
console.log(JSON.stringify(catRows, null, 2));

const [subCatRows] = await conn.query('SELECT * FROM complaint_sub_categories LIMIT 30');
console.log('\n=== complaint_sub_categories DATA ===');
console.log(JSON.stringify(subCatRows, null, 2));

const [smWorkers] = await conn.query("SELECT id,society_id,user_id,flat_no,role,status FROM society_members WHERE role IN ('staff','technician','provider') LIMIT 10");
console.log('\n=== society_members with worker roles ===');
console.log(JSON.stringify(smWorkers, null, 2));

const [complaints] = await conn.query('SELECT id,society_id,user_id,title,category,sub_category,status,assigned_to FROM society_complaints ORDER BY id DESC LIMIT 10');
console.log('\n=== recent society_complaints ===');
console.log(JSON.stringify(complaints, null, 2));

const [providers] = await conn.query('SELECT id,user_id,service_category_id,is_verified FROM service_provider_profiles WHERE is_deleted=0 LIMIT 10');
console.log('\n=== service_provider_profiles ===');
console.log(JSON.stringify(providers, null, 2));

await conn.end();
