import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';

const SocietyDocumentAcknowledgement = sequelize.define('SocietyDocumentAcknowledgement', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  document_version_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  document_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  version: {
    type: DataTypes.STRING(20),
    defaultValue: '1.0',
    allowNull: false,
  },
  acknowledged_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'society_document_acknowledgements',
});

SocietyDocumentAcknowledgement.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default SocietyDocumentAcknowledgement;
