/**
 * Follow Model — Phase 8
 * ─────────────────────────────────────────────────────────────────────────────
 * Represents a unidirectional "follow" relationship:
 *   follower_id  → the user who pressed "Follow"
 *   following_id → the user being followed
 *
 * Constraints (also enforced by migration 008):
 *   UNIQUE(follower_id, following_id)  — no duplicate follows
 *   follower_id !== following_id       — enforced in service layer (self-follow)
 *
 * Indexes (created by migration 008):
 *   ix_user_follows_follower_id  — fast "who does X follow?" queries
 *   ix_user_follows_following_id — fast "who follows X?" queries
 */

import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

const Follow = sequelize.define('Follow', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  follower_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  following_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'follows',
  indexes: [
    // Unique pair — prevents duplicates at DB level
    {
      unique: true,
      fields: ['follower_id', 'following_id'],
      name: 'uq_user_follows_pair',
    },
    {
      fields: ['follower_id'],
      name: 'ix_user_follows_follower_id',
    },
    {
      fields: ['following_id'],
      name: 'ix_user_follows_following_id',
    },
  ],
});

// Associations
Follow.belongsTo(User, { foreignKey: 'follower_id', as: 'follower' });
Follow.belongsTo(User, { foreignKey: 'following_id', as: 'following' });

export default Follow;
