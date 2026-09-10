import Joi from 'joi';
import { errorResponse } from '../../utils/response.js';

const id = Joi.number().integer().positive();
const pageQuery = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

export const validate = (schemas = {}) => (req, res, next) => {
  for (const source of ['params', 'query', 'body']) {
    if (!schemas[source]) continue;
    const { error, value } = schemas[source].validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      return errorResponse(res, 422, 'Validation failed', error.details.map((item) => item.message));
    }
    req[source] = value;
  }
  return next();
};

export const schemas = {
  id: { params: Joi.object({ id: id.required() }) },
  list: {
    query: Joi.object({
      ...pageQuery,
      search: Joi.string().trim().max(120).allow(''),
      category_id: id,
      is_private: Joi.boolean(),
      cursor: Joi.string().base64().max(1000),
    }),
  },
  create: {
    body: Joi.object({
      communityName: Joi.string().trim().min(2).max(255),
      name: Joi.string().trim().min(2).max(255),
      communityDescription: Joi.string().trim().max(5000).allow('', null),
      description: Joi.string().trim().max(5000).allow('', null),
      category_id: id.allow(null),
      cover_image: Joi.string().max(500).allow('', null),
      icon: Joi.string().max(500).allow('', null),
      is_private: Joi.boolean(),
      rules: Joi.alternatives().try(Joi.array().items(Joi.string().trim().max(500)).max(50), Joi.string().max(10000)),
      latitude: Joi.number().min(-90).max(90).allow(null),
      longitude: Joi.number().min(-180).max(180).allow(null),
      location_name: Joi.string().trim().max(255).allow('', null),
      discovery_radius: Joi.number().min(0.5).max(500).default(25.0),
    }).or('communityName', 'name'),
  },
  update: {
    params: Joi.object({ id: id.required() }),
    body: Joi.object({
      communityName: Joi.string().trim().min(2).max(255),
      communityDescription: Joi.string().trim().max(5000).allow('', null),
      category_id: id.allow(null),
      cover_image: Joi.string().max(500).allow('', null),
      icon: Joi.string().max(500).allow('', null),
      is_private: Joi.boolean(),
      rules: Joi.alternatives().try(Joi.array().items(Joi.string().trim().max(500)).max(50), Joi.string().max(10000)),
      status: Joi.string().valid('active', 'inactive'),
      latitude: Joi.number().min(-90).max(90).allow(null),
      longitude: Joi.number().min(-180).max(180).allow(null),
      location_name: Joi.string().trim().max(255).allow('', null),
      discovery_radius: Joi.number().min(0.5).max(500),
    }).min(1),
  },
  join: {
    params: Joi.object({ id: id.required() }),
    body: Joi.object({ note: Joi.string().trim().max(1000).allow('') }),
  },
  members: {
    params: Joi.object({ id: id.required() }),
    query: Joi.object({
      ...pageQuery,
      role: Joi.string().valid('admin', 'moderator', 'member'),
      search: Joi.string().trim().max(120).allow(''),
    }),
  },
  moderation: {
    params: Joi.object({ id: id.required(), memberId: id.required() }),
  },
  roleUpdate: {
    params: Joi.object({ id: id.required(), memberId: id.required() }),
    body: Joi.object({
      role: Joi.string().valid('admin', 'moderator', 'member').required(),
    }),
  },
  announcementId: {
    params: Joi.object({ id: id.required(), announcementId: id.required() }),
  },
  documentId: {
    params: Joi.object({ id: id.required(), documentId: id.required() }),
  },
  mediaId: {
    params: Joi.object({ id: id.required(), mediaId: id.required() }),
  },
  joinRequest: {
    params: Joi.object({ id: id.required(), requestId: id.required() }),
  },
  announcement: {
    params: Joi.object({ id: id.required() }),
    body: Joi.object({
      title: Joi.string().trim().min(1).max(255).required(),
      message: Joi.string().trim().min(1).max(10000).required(),
      isPinned: Joi.boolean().default(true),
    }),
  },
  document: {
    params: Joi.object({ id: id.required() }),
    body: Joi.object({
      title: Joi.string().trim().min(1).max(255).required(),
      file_url: Joi.string().max(500),
      fileUrl: Joi.string().max(500),
      fileType: Joi.string().trim().max(50),
      fileSize: Joi.string().trim().max(50),
    }),
  },
  gallery: {
    params: Joi.object({ id: id.required() }),
    body: Joi.object({
      media_url: Joi.string().max(500),
      mediaUrl: Joi.string().max(500),
      mediaType: Joi.string().valid('image', 'video').default('image'),
      caption: Joi.string().trim().max(255).allow('', null),
    }),
  },
  poll: {
    params: Joi.object({ id: id.required() }),
    body: Joi.object({
      question: Joi.string().trim().min(1).max(2000).required(),
      options: Joi.array().items(Joi.alternatives().try(
        Joi.string().trim().min(1).max(500),
        Joi.object({ text: Joi.string().trim().min(1).max(500).required() }),
      )).min(2).max(20).required(),
      expiresAt: Joi.date().iso().greater('now'),
    }),
  },
  vote: {
    params: Joi.object({ id: id.required(), pollId: id.required() }),
    body: Joi.object({ optionId: id.required() }),
  },
  feed: {
    params: Joi.object({ id: id.required() }),
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(50).default(20),
      cursor: Joi.string().base64().max(1000),
    }),
  },
  post: {
    params: Joi.object({ id: id.required() }),
    body: Joi.object({
      content: Joi.string().trim().max(5000).allow('', null),
      type: Joi.string().valid('text', 'image', 'video', 'poll', 'event', 'mixed'),
      mediaIds: Joi.array().items(id).max(5).default([]),
      media_urls: Joi.array().items(Joi.string().max(500)).max(5),
      locationName: Joi.string().trim().max(255).allow('', null),
    }).or('content', 'mediaIds'),
  },
  event: {
    params: Joi.object({ id: id.required() }),
    body: Joi.object({
      title: Joi.string().trim().min(1).max(255).required(),
      description: Joi.string().trim().max(10000).allow('', null),
      venue: Joi.string().trim().max(1000).allow('', null),
      location: Joi.string().trim().max(1000).allow('', null),
      date: Joi.date().iso().required(),
      endAt: Joi.date().iso().greater(Joi.ref('date')),
      coverImage: Joi.string().max(500).allow('', null),
      latitude: Joi.number().min(-90).max(90),
      longitude: Joi.number().min(-180).max(180),
    }),
  },
  rsvp: {
    params: Joi.object({ id: id.required(), eventId: id.required() }),
    body: Joi.object({ status: Joi.string().valid('going', 'interested', 'declined', 'not_going').required() }),
  },
  invite: {
    params: Joi.object({ id: id.required() }),
    body: Joi.object({ userIds: Joi.array().items(id).min(1).max(100), invitee_ids: Joi.array().items(id).min(1).max(100) }).or('userIds', 'invitee_ids'),
  },
  inviteable: {
    params: Joi.object({ id: id.required() }),
    query: Joi.object({
      ...pageQuery,
      search: Joi.string().trim().max(120).allow(''),
    }),
  },
  invitationResponse: {
    params: Joi.object({ id: id.required(), invitationId: id.required() }),
    body: Joi.object({ action: Joi.string().valid('accept', 'decline').required() }),
  },
  invitationList: {
    query: Joi.object({
      ...pageQuery,
      status: Joi.string().valid('pending', 'accepted', 'declined', 'revoked').default('pending'),
    }),
  },
};
