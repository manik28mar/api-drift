// Sample code exercising every status the matcher can produce.
import axios from 'axios';

const api = axios.create({ baseURL: '/v1' });

export async function loadPets() {
  // VALID: GET /pets via base-URL-tracked instance
  const res = await api.get('/pets');
  return res.data;
}

export async function deletePet(id: string) {
  // DEPRECATED: DELETE /pets/{petId}
  return axios.delete(`/v1/pets/${id}`);
}

export async function getProfile(userId: string) {
  // NOT_FOUND: /users/{id}/profile is not in the spec
  return fetch(`/v1/users/${userId}/profile`);
}

export async function patchPets(body: unknown) {
  // NOT_FOUND with method-mismatch reason: spec has GET/POST on /pets, not PATCH
  return fetch('/v1/pets', { method: 'PATCH', body: JSON.stringify(body) });
}

export async function dynamicUrl(target: string) {
  // DYNAMIC: url is an unknown identifier
  return fetch(target);
}

export async function dynamicMethod(opts: RequestInit) {
  // DYNAMIC: init object is a variable, can't read method
  return fetch('/v1/pets', opts);
}

export async function getMyPet() {
  // VALID: literal-wins-over-parametric (/pets/me beats /pets/{petId})
  return axios.get('/v1/pets/me');
}
