
'use strict';
const { loadState } = require('./store');

function getSubscription(userId) {
  const state = loadState();
  return state.subscriptions[userId] || { userId, planId: 'free', status: 'ACTIVE' };
}

function getPlan(planId) {
  const state = loadState();
  return state.plans[planId] || state.plans.free;
}

function hasFeature(userId, featureKey) {
  const sub = getSubscription(userId);
  if (sub.status !== 'ACTIVE' && sub.status !== 'PENDING') return false;
  if (sub.expiresAt && Date.now() > sub.expiresAt) return false;
  const plan = getPlan(sub.planId);
  return !!(plan.features && plan.features[featureKey]);
}

function getFeatureLimit(userId, limitKey) {
  const sub = getSubscription(userId);
  const plan = getPlan(sub.planId);
  if (plan.limits && plan.limits[limitKey] != null) return plan.limits[limitKey];
  return null;
}

module.exports = { hasFeature, getFeatureLimit, getSubscription, getPlan };
