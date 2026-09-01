import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import Community from '../community/community.model.js';
import User from '../user/user.model.js';

export const parseOptionsSafely = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'string') {
        const doubleParsed = JSON.parse(parsed);
        if (Array.isArray(doubleParsed)) return doubleParsed;
      }
    } catch {
      return [];
    }
  }
  return [];
};

const CommunityPoll = sequelize.define('CommunityPoll', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  community_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: Community,
      key: 'communityId',
    }
  },
  question: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  options: {
    type: DataTypes.JSON, // Array of { id: number, text: string, votesCount: number }
    allowNull: false,
    get() {
      const raw = this.getDataValue('options');
      return parseOptionsSafely(raw);
    },
    set(val) {
      if (typeof val === 'string') {
        try {
          this.setDataValue('options', JSON.parse(val));
        } catch {
          this.setDataValue('options', val);
        }
      } else {
        this.setDataValue('options', val);
      }
    }
  },
  total_votes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ...commonFields,
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    }
  }
}, {
  timestamps: false,
  tableName: 'community_polls',
  indexes: [
    { fields: ['community_id', 'created_at'] },
    { fields: ['expires_at'] },
  ],
});

CommunityPoll.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Community.hasMany(CommunityPoll, { foreignKey: 'community_id' });

CommunityPoll.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

export default CommunityPoll;
