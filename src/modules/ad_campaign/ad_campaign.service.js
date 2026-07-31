import AdCampaign from './ad_campaign.model.js';

export const createAdCampaign = async (data) => {
  return await AdCampaign.create(data);
};

export const getAllAdCampaigns = async () => {
  return await AdCampaign.findAll({
    where: { is_deleted: false },
    order: [['id', 'DESC']]
  });
};

export const getAdCampaignById = async (id) => {
  return await AdCampaign.findOne({
    where: { id, is_deleted: false }
  });
};

export const updateAdCampaign = async (id, updateData) => {
  const campaign = await AdCampaign.findOne({ where: { id, is_deleted: false } });
  if (!campaign) return null;
  return await campaign.update({ ...updateData, updatedAt: new Date() });
};

export const deleteAdCampaign = async (id, deletedRemarks, updated_by) => {
  const campaign = await AdCampaign.findOne({ where: { id, is_deleted: false } });
  if (!campaign) return null;
  return await campaign.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
