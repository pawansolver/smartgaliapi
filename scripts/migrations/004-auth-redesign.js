import { DataTypes } from 'sequelize';
import sequelize from '../../src/config/db.js';
import PendingSignup from '../../src/modules/auth/pending_signup.model.js';
import EmailOtp from '../../src/modules/auth/email_otp.model.js';
import RefreshToken from '../../src/modules/auth/refresh_token.model.js';

export const version = '004-auth-redesign';
const authModels = [PendingSignup, EmailOtp, RefreshToken];

export const up = async ({
  queryInterface = sequelize.getQueryInterface(),
  models = authModels,
} = {}) => {
  const users = await queryInterface.describeTable('users');
  if (!users.last_login) {
    await queryInterface.addColumn('users', 'last_login', {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
  for (const model of models) await model.sync();
};

export const down = async ({
  queryInterface = sequelize.getQueryInterface(),
  models = authModels,
} = {}) => {
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name)
  );
  for (const model of [...models].reverse()) {
    const tableName = model.getTableName();
    if (existingTables.includes(tableName)) await queryInterface.dropTable(tableName);
  }
  const users = await queryInterface.describeTable('users');
  if (users.last_login) await queryInterface.removeColumn('users', 'last_login');
};
