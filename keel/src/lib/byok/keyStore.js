/**
 * Client-side-only BYOK key storage.
 *
 * A user's provider API key is entered once in <SettingsModal/>, written to
 * this browser's localStorage, and read back out only to attach to outgoing
 * requests to /api/relay. It is never sent anywhere except:
 *   1. localStorage on this device
 *   2. the `x-keel-key` header of a single relay request, which api/relay.js
 *      forwards and immediately discards (see api/relay.js's top comment)
 *
 * Keel never writes a user's key to Supabase, to a log line, or to any
 * analytics event. If you are auditing this codebase for the "does the
 * operator ever have custody of my key" question, this file and api/relay.js
 * are the two places that answer it.
 */

const STORAGE_PREFIX = 'keel:key:';

/** @typedef {'groq'|'gemini'|'openrouter'} ProviderId */

/**
 * @param {ProviderId} providerId
 * @returns {string|null}
 */
export function getKey(providerId) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + providerId);
  } catch {
    // localStorage can throw in locked-down/private-browsing contexts.
    return null;
  }
}

/**
 * @param {ProviderId} providerId
 * @param {string} key
 */
export function setKey(providerId, key) {
  if (typeof window === 'undefined') return;
  try {
    if (!key) {
      window.localStorage.removeItem(STORAGE_PREFIX + providerId);
      return;
    }
    window.localStorage.setItem(STORAGE_PREFIX + providerId, key.trim());
  } catch {
    // Swallow: worst case the key isn't persisted for next session.
  }
}

export function clearKey(providerId) {
  setKey(providerId, '');
}

/** @returns {ProviderId[]} providers that currently have a key configured */
export function configuredProviders() {
  /** @type {ProviderId[]} */
  const all = ['groq', 'gemini', 'openrouter'];
  return all.filter((id) => Boolean(getKey(id)));
}

export function hasAnyKey() {
  return configuredProviders().length > 0;
}
