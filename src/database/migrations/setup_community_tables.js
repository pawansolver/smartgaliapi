import sequelize from '../../config/db.js';
import { logger } from '../../utils/logger.js';

export const up = async () => {
  const queryInterface = sequelize.getQueryInterface();

  logger.info('MIGRATION', 'Setting up community tables and columns...');

  // 1. Ensure columns on communities table
  try {
    const tableDesc = await queryInterface.describeTable('communities');
    if (!tableDesc.icon) {
      await queryInterface.addColumn('communities', 'icon', {
        type: sequelize.Sequelize.STRING(500),
        allowNull: true,
      });
    }
    if (!tableDesc.rules) {
      await queryInterface.addColumn('communities', 'rules', {
        type: sequelize.Sequelize.JSON,
        allowNull: true,
      });
    }
    if (!tableDesc.members_count) {
      await queryInterface.addColumn('communities', 'members_count', {
        type: sequelize.Sequelize.INTEGER,
        defaultValue: 1,
      });
    }
    if (!tableDesc.posts_count) {
      await queryInterface.addColumn('communities', 'posts_count', {
        type: sequelize.Sequelize.INTEGER,
        defaultValue: 0,
      });
    }
  } catch (err) {
    logger.warn('MIGRATION', 'Error checking communities table structure: ' + err.message);
  }

  // 2. Create community_join_requests
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS community_join_requests (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      community_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      note TEXT NULL,
      status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
      reviewed_by BIGINT NULL,
      reviewed_at DATETIME NULL,
      is_active BOOLEAN DEFAULT TRUE,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by BIGINT NULL,
      updated_by BIGINT NULL,
      remark TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deletedRemarks TEXT NULL,
      INDEX idx_comm_req_status (community_id, status),
      INDEX idx_user_comm (user_id, community_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 3. Create community_announcements
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS community_announcements (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      community_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_pinned BOOLEAN DEFAULT TRUE,
      is_active BOOLEAN DEFAULT TRUE,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by BIGINT NOT NULL,
      updated_by BIGINT NULL,
      remark TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deletedRemarks TEXT NULL,
      INDEX idx_comm_announcement (community_id, is_pinned, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 4. Create community_documents
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS community_documents (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      community_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL,
      file_url VARCHAR(500) NOT NULL,
      file_type VARCHAR(50) DEFAULT 'pdf',
      file_size VARCHAR(50) NULL,
      is_active BOOLEAN DEFAULT TRUE,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by BIGINT NOT NULL,
      updated_by BIGINT NULL,
      remark TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deletedRemarks TEXT NULL,
      INDEX idx_comm_doc (community_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 5. Create community_media
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS community_media (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      community_id BIGINT NOT NULL,
      media_url VARCHAR(500) NOT NULL,
      media_type ENUM('image', 'video') DEFAULT 'image',
      caption VARCHAR(255) NULL,
      is_active BOOLEAN DEFAULT TRUE,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by BIGINT NOT NULL,
      updated_by BIGINT NULL,
      remark TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deletedRemarks TEXT NULL,
      INDEX idx_comm_media (community_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 6. Create community_polls
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS community_polls (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      community_id BIGINT NOT NULL,
      question TEXT NOT NULL,
      options JSON NOT NULL,
      total_votes INT DEFAULT 0,
      expires_at DATETIME NULL,
      is_active BOOLEAN DEFAULT TRUE,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_by BIGINT NOT NULL,
      updated_by BIGINT NULL,
      remark TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deletedRemarks TEXT NULL,
      INDEX idx_comm_poll (community_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 7. Create community_poll_votes with UNIQUE constraint
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS community_poll_votes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      poll_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      option_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_poll_user (poll_id, user_id),
      INDEX idx_poll_option (poll_id, option_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  logger.info('MIGRATION', 'Community tables setup complete.');
};
