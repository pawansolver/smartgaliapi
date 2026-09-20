import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyWorkerAuthorization from './society_worker_authorization.model.js';

const SocietyWorkerSkill = sequelize.define('SocietyWorkerSkill', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  authorization_id: {
    type: DataTypes.BIGINT, allowNull: false,
    references: { model: SocietyWorkerAuthorization, key: 'id' },
  },
  complaint_category_id: { type: DataTypes.BIGINT, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'society_worker_skills', timestamps: false });

SocietyWorkerSkill.belongsTo(SocietyWorkerAuthorization, { foreignKey: 'authorization_id', as: 'authorization' });
SocietyWorkerAuthorization.hasMany(SocietyWorkerSkill, { foreignKey: 'authorization_id', as: 'skills' });

export default SocietyWorkerSkill;
