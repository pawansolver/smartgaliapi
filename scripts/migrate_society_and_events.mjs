import { pathToFileURL } from 'url';

const backendRoot = 'C:/Users/pawan/Downloads/smartgaliAPI-main/smartgaliAPI-main';
const dbPath = backendRoot + '/src/config/db.js';
const { default: seq } = await import(pathToFileURL(dbPath).href);

async function runMigration() {
  console.log('🚀 Running Forward Migration: Society & Event Extensions...');
  await seq.authenticate();
  console.log('✅ Connected to database:', seq.config.database);

  // 1. events.society_id
  const [eventCols] = await seq.query('SHOW COLUMNS FROM events');
  const eventColNames = eventCols.map(c => c.Field);
  if (!eventColNames.includes('society_id')) {
    console.log('Adding society_id to events table...');
    await seq.query(`
      ALTER TABLE events 
      ADD COLUMN society_id BIGINT NULL AFTER community_id
    `);
    await seq.query(`
      ALTER TABLE events 
      ADD CONSTRAINT fk_events_society 
      FOREIGN KEY (society_id) REFERENCES society_profiles(id) 
      ON DELETE SET NULL ON UPDATE CASCADE
    `).catch(err => {
      console.log('Note: FK addition skipped or already present:', err.message);
    });
    await seq.query(`
      CREATE INDEX ix_events_society_status_del 
      ON events (society_id, status, is_deleted)
    `).catch(err => {
      console.log('Note: Index ix_events_society_status_del note:', err.message);
    });
    console.log('✅ events.society_id added successfully.');
  } else {
    console.log('ℹ️ events.society_id already exists.');
  }

  // 2. society_documents table
  console.log('Ensuring society_documents table...');
  await seq.query(`
    CREATE TABLE IF NOT EXISTS society_documents (
      id BIGINT NOT NULL AUTO_INCREMENT,
      society_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      file_url VARCHAR(500) NOT NULL,
      file_type VARCHAR(50) NULL,
      file_size BIGINT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      uploaded_by BIGINT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_by BIGINT NULL,
      updated_by BIGINT NULL,
      remark TEXT NULL,
      deletedRemarks TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX ix_soc_docs_soc_del (society_id, is_deleted),
      INDEX ix_soc_docs_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✅ society_documents table verified/created.');

  // 3. society_emergency_contacts table
  console.log('Ensuring society_emergency_contacts table...');
  await seq.query(`
    CREATE TABLE IF NOT EXISTS society_emergency_contacts (
      id BIGINT NOT NULL AUTO_INCREMENT,
      society_id BIGINT NOT NULL,
      name VARCHAR(150) NOT NULL,
      designation VARCHAR(150) NULL,
      phone VARCHAR(30) NOT NULL,
      alt_phone VARCHAR(30) NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_by BIGINT NULL,
      updated_by BIGINT NULL,
      remark TEXT NULL,
      deletedRemarks TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX ix_soc_emg_soc_del (society_id, is_deleted),
      INDEX ix_soc_emg_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✅ society_emergency_contacts table verified/created.');

  // 4. event_invitations table
  console.log('Ensuring event_invitations table...');
  await seq.query(`
    CREATE TABLE IF NOT EXISTS event_invitations (
      id BIGINT NOT NULL AUTO_INCREMENT,
      event_id BIGINT NOT NULL,
      inviter_user_id BIGINT NOT NULL,
      invitee_user_id BIGINT NOT NULL,
      status ENUM('pending', 'accepted', 'declined', 'cancelled') NOT NULL DEFAULT 'pending',
      response_at DATETIME NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
      created_by BIGINT NULL,
      updated_by BIGINT NULL,
      remark TEXT NULL,
      deletedRemarks TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uix_event_invitee_del (event_id, invitee_user_id, is_deleted),
      INDEX ix_event_inv_invitee_status (invitee_user_id, status),
      INDEX ix_event_inv_event_status (event_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✅ event_invitations table verified/created.');

  console.log('\n🎉 All migrations successfully applied!');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
