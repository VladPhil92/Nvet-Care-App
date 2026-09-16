import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { PetsService } from "./pets.service";

describe("PetsService pet photo", () => {
  const petFindUnique = jest.fn();
  const petUpdate = jest.fn();
  const prisma = {
    pet: {
      findUnique: petFindUnique,
      update: petUpdate,
    },
  } as unknown as PrismaService;
  const storageUpload = jest.fn();
  const storage = { upload: storageUpload } as unknown as StorageService;
  const service = new PetsService(prisma, storage);

  const file = {
    buffer: Buffer.from("fake-image-bytes"),
    mimetype: "image/jpeg",
  } as unknown as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uploads the photo through StorageService and persists its public URL", async () => {
    petFindUnique.mockResolvedValue({ id: "pet-1", ownerId: "owner-1" });
    storageUpload.mockResolvedValue({
      url: "/uploads/public/pets/pet-1/photo.jpg",
      storageKey: "/data/uploads/public/pets/pet-1/photo.jpg",
      driver: "local",
      visibility: "public",
    });
    petUpdate.mockResolvedValue({ id: "pet-1", photo: "/uploads/public/pets/pet-1/photo.jpg" });

    await service.updatePhoto(
      "owner-1",
      "pet-1",
      file,
      "https://staging.nvetcare.com",
    );

    expect(storageUpload).toHaveBeenCalledWith(file, "pets/pet-1", {
      publicBaseUrl: "https://staging.nvetcare.com",
    });
    expect(petUpdate).toHaveBeenCalledWith({
      where: { id: "pet-1" },
      data: { photo: "/uploads/public/pets/pet-1/photo.jpg" },
    });
  });

  it("rejects an upload with no file", async () => {
    await expect(
      service.updatePhoto("owner-1", "pet-1", undefined as unknown as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(petFindUnique).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("rejects a photo upload from a non-owner", async () => {
    petFindUnique.mockResolvedValue({ id: "pet-1", ownerId: "owner-1" });

    await expect(
      service.updatePhoto("other-user", "pet-1", file),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("rejects a photo upload for a nonexistent pet", async () => {
    petFindUnique.mockResolvedValue(null);

    await expect(
      service.updatePhoto("owner-1", "missing-pet", file),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("clears the photo on removal", async () => {
    petFindUnique.mockResolvedValue({ id: "pet-1", ownerId: "owner-1", photo: "/uploads/public/pets/pet-1/photo.jpg" });
    petUpdate.mockResolvedValue({ id: "pet-1", photo: null });

    await service.removePhoto("owner-1", "pet-1");

    expect(petUpdate).toHaveBeenCalledWith({
      where: { id: "pet-1" },
      data: { photo: null },
    });
  });

  it("is a no-op when the pet has no photo", async () => {
    const pet = { id: "pet-1", ownerId: "owner-1", photo: null };
    petFindUnique.mockResolvedValue(pet);

    const result = await service.removePhoto("owner-1", "pet-1");

    expect(result).toBe(pet);
    expect(petUpdate).not.toHaveBeenCalled();
  });

  it("rejects photo removal from a non-owner", async () => {
    petFindUnique.mockResolvedValue({ id: "pet-1", ownerId: "owner-1", photo: "x" });

    await expect(service.removePhoto("other-user", "pet-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(petUpdate).not.toHaveBeenCalled();
  });
});
