import { apiClient } from './api'

/**
 * Servicio de mascotas — utilizado tanto por el cliente (gestionar sus mascotas)
 * como por el vet (consultar la mascota de una cita en su agenda).
 *
 * Endpoints esperados del backend:
 *   GET    /pets/me        — listar mascotas del cliente autenticado
 *   GET    /pets/:id       — detalle (solo dueño o vet con cita activa)
 *   POST   /pets           — crear mascota
 *   PATCH  /pets/:id       — actualizar
 *   DELETE /pets/:id       — eliminar (soft delete)
 *   POST   /pets/:id/photo — subir/reemplazar foto (multipart, campo "file")
 *   DELETE /pets/:id/photo — quitar foto
 */

export type PetSpecies =
  | 'DOG'
  | 'CAT'
  | 'BIRD'
  | 'RABBIT'
  | 'REPTILE'
  | 'FISH'
  | 'OTHER'

export interface Pet {
  id: string
  ownerId: string
  name: string
  species: string
  breed?: string | null
  weight?: number | null
  birthDate?: string | null
  photo?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePetData {
  name: string
  species: string
  breed?: string
  weight?: number
  birthDate?: string
  notes?: string
}

export interface UpdatePetData {
  name?: string
  species?: string
  breed?: string
  weight?: number
  birthDate?: string
  notes?: string
}

class PetService {
  async getMyPets(): Promise<Pet[]> {
    const response = await apiClient.get('/pets/me')
    return response.data
  }

  async getPetById(petId: string): Promise<Pet> {
    const response = await apiClient.get(`/pets/${petId}`)
    return response.data
  }

  async createPet(data: CreatePetData): Promise<Pet> {
    const response = await apiClient.post('/pets', data)
    return response.data
  }

  async updatePet(petId: string, data: UpdatePetData): Promise<Pet> {
    const response = await apiClient.patch(`/pets/${petId}`, data)
    return response.data
  }

  async deletePet(petId: string): Promise<void> {
    await apiClient.delete(`/pets/${petId}`)
  }

  async uploadPhoto(petId: string, formData: FormData): Promise<Pet> {
    const response = await apiClient.post(`/pets/${petId}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async deletePhoto(petId: string): Promise<Pet> {
    const response = await apiClient.delete(`/pets/${petId}/photo`)
    return response.data
  }
}

export const petService = new PetService()
export default petService
