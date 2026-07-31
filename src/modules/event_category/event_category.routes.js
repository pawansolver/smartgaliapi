import express from 'express';
import * as eventCategoryController from './event_category.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';

const router = express.Router();

router.post('/', uploadImage('eventCategory').single('icon'), eventCategoryController.createEventCategory);
router.get('/', eventCategoryController.getAllEventCategories);
router.get('/:id', eventCategoryController.getEventCategoryById);
router.put('/:id', uploadImage('eventCategory').single('icon'), eventCategoryController.updateEventCategory);
router.delete('/:id', eventCategoryController.deleteEventCategory);

export default router;
