import { pb } from './pb-config.js';

export async function requestOTP(email) {
  return await pb.collection('users').requestOTP(email);
}

export async function authWithOTP(otpId, password) {
  return await pb.collection('users').authWithOTP(otpId, password);
}

export function signOut() {
  return pb.authStore.clear();
}

export function isLoggedIn() {
  return Boolean(pb.authStore.isValid);
}

export function currentUser() {
  return pb.authStore.record;
}
