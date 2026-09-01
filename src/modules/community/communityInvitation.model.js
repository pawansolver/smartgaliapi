import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import Community from './community.model.js';
import User from '../user/user.model.js';

const CommunityInvitation = sequelize.define('CommunityInvitation', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  community_id: { type: DataTypes.BIGINT, allowNull: false },
  invited_user_id: { type: DataTypes.BIGINT, allowNull: false },
  invited_by: { type: DataTypes.BIGINT, allowNull: false },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined', 'revoked'),
    allowNull: false,
    defaultValue: 'pending',
  },
  pending_key: { type: DataTypes.TINYINT, allowNull: true, defaultValue: 1 },
  responded_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'community_invitations',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['community_id', 'invited_user_id', 'pending_key'] },
    { fields: ['invited_user_id', 'status', 'created_at'] },
  ],
});

CommunityInvitation.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
CommunityInvitation.belongsTo(User, { foreignKey: 'invited_by', as: 'inviter' });

export default CommunityInvitation;
