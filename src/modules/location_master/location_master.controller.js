import { Country, State, City, Locality, Pincode } from './location_master.models.js';

export const getCountries = async (req, res, next) => {
  try {
    const countries = await Country.findAll({
      where: { is_active: true, is_deleted: false },
      order: [['display_order', 'ASC'], ['name', 'ASC']],
    });
    res.json({ success: true, data: countries });
  } catch (err) {
    next(err);
  }
};

export const getStates = async (req, res, next) => {
  try {
    const { country_id } = req.query;
    const where = { is_active: true, is_deleted: false };
    if (country_id) where.country_id = country_id;

    const states = await State.findAll({
      where,
      order: [['display_order', 'ASC'], ['name', 'ASC']],
    });
    res.json({ success: true, data: states });
  } catch (err) {
    next(err);
  }
};

export const getCities = async (req, res, next) => {
  try {
    const { state_id } = req.query;
    const where = { is_active: true, is_deleted: false };
    if (state_id) where.state_id = state_id;

    const cities = await City.findAll({
      where,
      order: [['display_order', 'ASC'], ['name', 'ASC']],
    });
    res.json({ success: true, data: cities });
  } catch (err) {
    next(err);
  }
};

export const getLocalities = async (req, res, next) => {
  try {
    const { city_id, search } = req.query;
    const where = { is_active: true, is_deleted: false };
    if (city_id) where.city_id = city_id;

    const localities = await Locality.findAll({
      where,
      order: [['display_order', 'ASC'], ['name', 'ASC']],
    });
    res.json({ success: true, data: localities });
  } catch (err) {
    next(err);
  }
};

export const getPincodes = async (req, res, next) => {
  try {
    const { city_id, locality_id } = req.query;
    const where = { is_active: true, is_deleted: false };
    if (city_id) where.city_id = city_id;
    if (locality_id) where.locality_id = locality_id;

    const pincodes = await Pincode.findAll({
      where,
      order: [['display_order', 'ASC'], ['pincode', 'ASC']],
    });
    res.json({ success: true, data: pincodes });
  } catch (err) {
    next(err);
  }
};

export const getLocationHierarchy = async (req, res, next) => {
  try {
    const cities = await City.findAll({
      where: { is_active: true, is_deleted: false },
      include: [
        { model: Locality, as: 'localities', where: { is_active: true, is_deleted: false }, required: false },
        { model: Pincode, as: 'pincodes', where: { is_active: true, is_deleted: false }, required: false },
      ],
      order: [
        ['display_order', 'ASC'],
        [{ model: Locality, as: 'localities' }, 'display_order', 'ASC'],
        [{ model: Pincode, as: 'pincodes' }, 'display_order', 'ASC'],
      ],
    });
    res.json({ success: true, data: cities });
  } catch (err) {
    next(err);
  }
};

export default {
  getCountries,
  getStates,
  getCities,
  getLocalities,
  getPincodes,
  getLocationHierarchy,
};
