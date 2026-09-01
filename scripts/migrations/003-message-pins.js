import MessagePin from '../../src/modules/message_pin/message_pin.model.js';

export const version = '003-message-pins';

export const up = async ({ model = MessagePin } = {}) => {
  await model.sync();
};

export const down = async ({
  queryInterface = MessagePin.sequelize.getQueryInterface(),
  model = MessagePin,
} = {}) => {
  const tableName = model.getTableName();
  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name)
  );
  if (tables.includes(tableName)) await queryInterface.dropTable(tableName);
};
