import * as fs from "fs";
import * as path from "path";

describe("CLIENT Profile & Account Center V1 contract", () => {
  it("keeps identity fields read-only and external channels undeployed", () => {
    const contract = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "PROFILE_V1_CONTRACT.json"),
        "utf8",
      ),
    );

    expect(contract.authority.identitySource).toBe("AUTHENTICATED_JWT_SUBJECT");
    expect(contract.authority.effectiveRole).toBe("CLIENT");
    expect(contract.authority.readOnlyFields).toEqual(
      expect.arrayContaining(["email", "userId", "ctgUserId", "role"]),
    );
    expect(contract.authority.mutableFields).toEqual([
      "firstName",
      "lastName",
      "phone",
    ]);
    expect(contract.channels.inAppNotifications).toBe("ACTIVE");
    expect(contract.channels.emailNotifications).toBe("NOT_DEPLOYED");
    expect(contract.channels.pushNotifications).toBe("NOT_DEPLOYED");
  });
});
