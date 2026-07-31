import { DataTypes } from 'sequelize';
import sequelize from '../../src/config/db.js';
import '../../src/modules/user/user.model.js';
import '../../src/modules/userProfile/userProfile.model.js';
import UserAddress from '../../src/modules/profile/user_address.model.js';
import NotificationPreference from '../../src/modules/profile/notification_preference.model.js';
import PrivacySetting from '../../src/modules/profile/privacy_setting.model.js';
import SupportTicket from '../../src/modules/profile/support_ticket.model.js';
import DataExportRequest from '../../src/modules/profile/data_export_request.model.js';

export const version = '001-profile-module';

const profileTables = [
  UserAddress,
  NotificationPreference,
  PrivacySetting,
  SupportTicket,
  DataExportRequest,
];

const ensureColumn = async (queryInterface, table, column, definition) => {
  const description = await queryInterface.describeTable(table);
  if (!description[column]) await queryInterface.addColumn(table, column, definition);
};

const removeColumnIfPresent = async (queryInterface, table, column) => {
  const description = await queryInterface.describeTable(table);
  if (description[column]) await queryInterface.removeColumn(table, column);
};

export const up = async ({
  queryInterface = sequelize.getQueryInterface(),
  models = profileTables,
} = {}) => {
  await ensureColumn(queryInterface, 'users', 'password', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, 'user_profiles', 'bio', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await ensureColumn(queryInterface, 'user_profiles', 'avatarUrl', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await ensureColumn(queryInterface, 'user_profiles', 'locationName', {
    type: DataTypes.STRING,
    allowNull: true,
  });

  for (const model of models) await model.sync();
};

export const down = async ({
  queryInterface = sequelize.getQueryInterface(),
  models = profileTables,
} = {}) => {
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name)
  );
  for (const model of [...models].reverse()) {
    const tableName = model.getTableName();
    if (existingTables.includes(tableName)) await queryInterface.dropTable(tableName);
  }
  await removeColumnIfPresent(queryInterface, 'user_profiles', 'locationName');
  await removeColumnIfPresent(queryInterface, 'user_profiles', 'avatarUrl');
  await removeColumnIfPresent(queryInterface, 'user_profiles', 'bio');
  await removeColumnIfPresent(queryInterface, 'users', 'password');
};
