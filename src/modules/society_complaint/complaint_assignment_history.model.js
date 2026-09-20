import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';

const ComplaintAssignmentHistory = sequelize.define('ComplaintAssignmentHistory', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  complaint_id: { type: DataTypes.BIGINT, allowNull: false },
  previous_assignee_id: { type: DataTypes.BIGINT, allowNull: true },
  new_assignee_id: { type: DataTypes.BIGINT, allowNull: true },
  assigned_by: { type: DataTypes.BIGINT, allowNull: false },
  action_type: {
    type: DataTypes.ENUM('assigned', 'reassigned', 'unassigned'),
    allowNull: false, defaultValue: 'assigned',
  },
  reason: { type: DataTypes.TEXT, allowNull: true },
  assigned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'complaint_assignment_history', timestamps: false });

ComplaintAssignmentHistory.belongsTo(User, { foreignKey: 'assigned_by', as: 'assignedByUser' });
ComplaintAssignmentHistory.belongsTo(User, { foreignKey: 'previous_assignee_id', as: 'previousAssignee' });
ComplaintAssignmentHistory.belongsTo(User, { foreignKey: 'new_assignee_id', as: 'newAssignee' });

export default ComplaintAssignmentHistory;
