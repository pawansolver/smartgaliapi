import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const ANNOUNCEMENT_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
});

export const ANNOUNCEMENT_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

export const ANNOUNCEMENT_AUDIENCE = Object.freeze({
  ENTIRE_SOCIETY: 'entire_society',
  BLOCK: 'block',
  COMMITTEE: 'committee',
});

const SocietyAnnouncement = sequelize.define('SocietyAnnouncement', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  announcement_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  summary: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  action_text: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  audience: {
    type: DataTypes.ENUM('entire_society', 'block', 'committee'),
    defaultValue: 'entire_society',
    allowNull: false,
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium',
    allowNull: false,
  },
  is_pinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(100),
    defaultValue: 'general',
    allowNull: false,
  },
  publish_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('draft', 'published', 'archived'),
    defaultValue: 'published',
    allowNull: false,
  },
  attachments: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    get() {
      const raw = this.getDataValue('attachments');
      if (!raw) return [];
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return Array.isArray(raw) ? raw : [];
    },
    set(val) {
      if (!val) {
        this.setDataValue('attachments', []);
      } else if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          this.setDataValue('attachments', Array.isArray(parsed) ? parsed : []);
        } catch {
          this.setDataValue('attachments', []);
        }
      } else {
        this.setDataValue('attachments', Array.isArray(val) ? val : []);
      }
    },
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'society_announcements',
});

SocietyAnnouncement.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyAnnouncement.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

export default SocietyAnnouncement;

