/**
 * Enterprise Society Complaint → Worker Resolution Lifecycle
 * DB Migration Script (Idempotent)
 */

import mysql from 'mysql2/promise';

const DB = {
  host: 'srv1100.hstgr.io',
  user: 'u963801592_smartgaliU',
  password: 'SmartGali232026',
  database: 'u963801592_SmartGali',
  port: 3306,
};

async function run() {
  const conn = await mysql.createConnection(DB);
  console.log('Connected to database');

  try {
    // STEP 1: Create society_worker_authorizations
    console.log('\nStep 1: Creating society_worker_authorizations...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS society_worker_authorizations (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        society_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        service_provider_profile_id BIGINT NULL,
        designation VARCHAR(255) NOT NULL DEFAULT 'Worker',
        authorization_status ENUM('active','suspended','revoked','pending') NOT NULL DEFAULT 'active',
        start_date DATE NULL,
        end_date DATE NULL,
        notes TEXT NULL,
        created_by BIGINT NULL,
        updated_by BIGINT NULL,
        is_deleted TINYINT(1) NOT NULL DEFAULT 0,
        remark TEXT NULL,
        deletedRemarks TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_society_id (society_id),
        INDEX idx_user_id (user_id),
        INDEX idx_authorization_status (authorization_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  society_worker_authorizations OK');

    // STEP 2: Create society_worker_skills
    console.log('\nStep 2: Creating society_worker_skills...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS society_worker_skills (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        authorization_id BIGINT NOT NULL,
        complaint_category_id BIGINT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_auth_cat (authorization_id, complaint_category_id),
        INDEX idx_auth_id (authorization_id),
        INDEX idx_cat_id (complaint_category_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  society_worker_skills OK');

    // STEP 3: Create complaint_assignment_history
    console.log('\nStep 3: Creating complaint_assignment_history...');
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS complaint_assignment_history (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        complaint_id BIGINT NOT NULL,
        previous_assignee_id BIGINT NULL,
        new_assignee_id BIGINT NULL,
        assigned_by BIGINT NOT NULL,
        action_type ENUM('assigned','reassigned','unassigned') NOT NULL DEFAULT 'assigned',
        reason TEXT NULL,
        assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_complaint_id (complaint_id),
        INDEX idx_new_assignee_id (new_assignee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('  complaint_assignment_history OK');

    // STEP 4: Alter society_complaints
    console.log('\nStep 4: Altering society_complaints...');
    const [cols] = await conn.execute('DESCRIBE society_complaints');
    const existingCols = cols.map(c => c.Field);

    if (!existingCols.includes('accepted_at')) {
      await conn.execute('ALTER TABLE society_complaints ADD COLUMN accepted_at DATETIME NULL AFTER resolved_at');
      console.log('  Added accepted_at');
    } else { console.log('  accepted_at already exists'); }

    if (!existingCols.includes('accepted_by')) {
      await conn.execute('ALTER TABLE society_complaints ADD COLUMN accepted_by BIGINT NULL AFTER accepted_at');
      console.log('  Added accepted_by');
    } else { console.log('  accepted_by already exists'); }

    if (!existingCols.includes('started_at')) {
      await conn.execute('ALTER TABLE society_complaints ADD COLUMN started_at DATETIME NULL AFTER accepted_by');
      console.log('  Added started_at');
    } else { console.log('  started_at already exists'); }

    if (!existingCols.includes('resolution_note')) {
      await conn.execute('ALTER TABLE society_complaints ADD COLUMN resolution_note TEXT NULL AFTER started_at');
      console.log('  Added resolution_note');
    } else { console.log('  resolution_note already exists'); }

    const statusCol = cols.find(c => c.Field === 'status');
    if (statusCol && !statusCol.Type.includes('accepted')) {
      await conn.execute(`ALTER TABLE society_complaints MODIFY COLUMN status ENUM('open','assigned','accepted','in_progress','resolved','closed') NOT NULL DEFAULT 'open'`);
      console.log('  Added "accepted" to status ENUM');
    } else { console.log('  "accepted" already in status ENUM'); }

    // STEP 5: Data Migration
    console.log('\nStep 5: Migrating worker roles...');
    const [workerRows] = await conn.execute(
      "SELECT id, society_id, user_id, flat_no, role, status FROM society_members WHERE role IN ('staff','technician','provider') AND is_deleted = 0"
    );
    console.log(`  Found ${workerRows.length} worker member(s) to migrate`);

    for (const row of workerRows) {
      const [existing] = await conn.execute(
        'SELECT id FROM society_worker_authorizations WHERE society_id = ? AND user_id = ? AND is_deleted = 0',
        [row.society_id, row.user_id]
      );

      if (existing.length > 0) {
        console.log(`  User #${row.user_id} in society #${row.society_id} already authorized`);
        continue;
      }

      const flatNoValue = row.flat_no ? String(row.flat_no).trim() : null;
      const isTradeString = flatNoValue && !/^[\d\-\/]+[A-Za-z]?$/.test(flatNoValue.replace(/\s/g, ''));
      const designation = isTradeString ? flatNoValue : (
        row.role === 'staff' ? 'Staff Worker' :
        row.role === 'technician' ? 'Technician' : 'Service Provider'
      );

      let serviceProviderProfileId = null;
      if (row.role === 'provider') {
        const [profRows] = await conn.execute(
          'SELECT id FROM service_provider_profiles WHERE user_id = ? AND is_deleted = 0 LIMIT 1',
          [row.user_id]
        );
        if (profRows.length > 0) serviceProviderProfileId = profRows[0].id;
      }

      const authStatus = row.status === 'active' ? 'active' : 'suspended';

      await conn.execute(
        'INSERT INTO society_worker_authorizations (society_id, user_id, service_provider_profile_id, designation, authorization_status, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [row.society_id, row.user_id, serviceProviderProfileId, designation, authStatus, `Migrated from society_members role="${row.role}"`]
      );
      console.log(`  Authorized user #${row.user_id} (${designation}) for society #${row.society_id}`);

      if (isTradeString) {
        await conn.execute('UPDATE society_members SET flat_no = NULL WHERE id = ?', [row.id]);
        console.log(`  Restored flat_no to NULL for member #${row.id} (was: "${flatNoValue}")`);
      }
    }

    // STEP 6: Verification
    console.log('\nStep 6: Verification...');
    const [a1] = await conn.execute('SELECT COUNT(*) as c FROM society_worker_authorizations');
    const [a2] = await conn.execute('SELECT COUNT(*) as c FROM society_worker_skills');
    const [a3] = await conn.execute('SELECT COUNT(*) as c FROM complaint_assignment_history');
    console.log(`  society_worker_authorizations: ${a1[0].c} records`);
    console.log(`  society_worker_skills: ${a2[0].c} records`);
    console.log(`  complaint_assignment_history: ${a3[0].c} records`);
    const [finalCols] = await conn.execute("SHOW COLUMNS FROM society_complaints LIKE 'status'");
    console.log(`  society_complaints.status type: ${finalCols[0].Type}`);

    console.log('\nMigration completed successfully!');

  } catch (err) {
    console.error('Migration error:', err.message);
    throw err;
  } finally {
    await conn.end();
  }
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
