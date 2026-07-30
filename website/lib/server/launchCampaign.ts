import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminDb } from "@/lib/server/firebaseAdmin";
import { applyBillingDerivedDailyTokenLimit } from "@/lib/server/promptlyBackend";

const SETTINGS_COLLECTION = "promptly_settings";
const CAMPAIGN_DOC_ID = "launch_campaign";
const USER_COLLECTION = "users";

export const LAUNCH_CAMPAIGN_DEFAULT_MAX = 1000;

export type LaunchCampaignRecord = {
  active: boolean;
  maxFreeAccounts: number;
  claimedCount: number;
  baselineAccountCount: number;
  initializedAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

export type PublicLaunchCampaignStatus = {
  promoActive: boolean;
  maxFreeAccounts: number;
  claimedCount: number;
  remaining: number;
};

export type AdminLaunchCampaignStatus = PublicLaunchCampaignStatus & {
  active: boolean;
  initializedAt: string | null;
  baselineAccountCount: number;
  newClaimsSinceInit: number;
};

function campaignRef() {
  return getFirebaseAdminDb().collection(SETTINGS_COLLECTION).doc(CAMPAIGN_DOC_ID);
}

function parseCampaign(raw: Record<string, unknown> | undefined): LaunchCampaignRecord {
  const data = raw || {};
  return {
    active: data.active !== false,
    maxFreeAccounts: Math.max(
      1,
      Math.floor(Number(data.maxFreeAccounts || LAUNCH_CAMPAIGN_DEFAULT_MAX) || LAUNCH_CAMPAIGN_DEFAULT_MAX)
    ),
    claimedCount: Math.max(0, Math.floor(Number(data.claimedCount || 0) || 0)),
    baselineAccountCount: Math.max(0, Math.floor(Number(data.baselineAccountCount || 0) || 0)),
    initializedAt: data.initializedAt instanceof Timestamp ? data.initializedAt : null,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : null
  };
}

export async function countLaunchCampaignUsers(): Promise<number> {
  const snap = await getFirebaseAdminDb().collection(USER_COLLECTION).get();
  let count = 0;
  for (const doc of snap.docs) {
    const raw = doc.data() as Record<string, unknown>;
    if (raw.duplicateDisabled || typeof raw.mergedIntoUid === "string") {
      continue;
    }
    count += 1;
  }
  return count;
}

async function ensureLaunchCampaignInitialized(): Promise<LaunchCampaignRecord> {
  const ref = campaignRef();
  const snap = await ref.get();
  const existing = parseCampaign(snap.exists ? (snap.data() as Record<string, unknown>) : undefined);
  if (existing.initializedAt) {
    return existing;
  }

  const userCount = await countLaunchCampaignUsers();
  const initializedAt = Timestamp.now();
  const next: LaunchCampaignRecord = {
    active: existing.active,
    maxFreeAccounts: existing.maxFreeAccounts || LAUNCH_CAMPAIGN_DEFAULT_MAX,
    claimedCount: userCount,
    baselineAccountCount: userCount,
    initializedAt,
    updatedAt: initializedAt
  };

  await ref.set(
    {
      active: next.active,
      maxFreeAccounts: next.maxFreeAccounts,
      claimedCount: next.claimedCount,
      baselineAccountCount: next.baselineAccountCount,
      initializedAt,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return next;
}

function buildPublicStatus(campaign: LaunchCampaignRecord): PublicLaunchCampaignStatus {
  const remaining = Math.max(0, campaign.maxFreeAccounts - campaign.claimedCount);
  const promoActive = campaign.active && remaining > 0;
  return {
    promoActive,
    maxFreeAccounts: campaign.maxFreeAccounts,
    claimedCount: campaign.claimedCount,
    remaining
  };
}

export async function getPublicLaunchCampaignStatus(): Promise<PublicLaunchCampaignStatus> {
  const campaign = await ensureLaunchCampaignInitialized();
  return buildPublicStatus(campaign);
}

export async function getAdminLaunchCampaignStatus(): Promise<AdminLaunchCampaignStatus> {
  const campaign = await ensureLaunchCampaignInitialized();
  const publicStatus = buildPublicStatus(campaign);
  const baselineAccountCount =
    campaign.baselineAccountCount > 0 ? campaign.baselineAccountCount : campaign.claimedCount;
  const newClaimsSinceInit = Math.max(0, campaign.claimedCount - baselineAccountCount);
  return {
    ...publicStatus,
    active: campaign.active,
    initializedAt: campaign.initializedAt?.toDate?.()?.toISOString?.() ?? null,
    baselineAccountCount,
    newClaimsSinceInit
  };
}

export async function updateLaunchCampaign(patch: {
  active?: boolean;
  maxFreeAccounts?: number;
  claimedCount?: number;
}): Promise<AdminLaunchCampaignStatus> {
  await ensureLaunchCampaignInitialized();
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp()
  };
  if (typeof patch.active === "boolean") {
    update.active = patch.active;
  }
  if (patch.maxFreeAccounts != null) {
    update.maxFreeAccounts = Math.max(1, Math.floor(Number(patch.maxFreeAccounts) || LAUNCH_CAMPAIGN_DEFAULT_MAX));
  }
  if (patch.claimedCount != null) {
    update.claimedCount = Math.max(0, Math.floor(Number(patch.claimedCount) || 0));
  }
  await campaignRef().set(update, { merge: true });
  return getAdminLaunchCampaignStatus();
}

function userCreatedAtMs(raw: Record<string, unknown>): number {
  const createdAt = raw.createdAt;
  if (createdAt instanceof Timestamp) {
    return createdAt.toMillis();
  }
  return 0;
}

function userAlreadyHasPaidTier(raw: Record<string, unknown>): boolean {
  const tier = String(raw.subscriptionTier || raw.plan || "free").toLowerCase();
  if (tier === "pro" || tier === "plus" || tier === "professional" || tier === "student" || tier === "enterprise") {
    const status = String(raw.subscriptionStatus || "active").toLowerCase();
    if (!status || status === "active" || status === "trialing" || status === "none") {
      return true;
    }
  }
  return raw.launchCampaignPro === true;
}

export async function claimLaunchCampaignPro(uid: string): Promise<{
  ok: true;
  alreadyGranted: boolean;
  remaining: number;
}> {
  const db = getFirebaseAdminDb();
  const campaign = await ensureLaunchCampaignInitialized();
  const userRef = db.collection(USER_COLLECTION).doc(uid);

  return db.runTransaction(async (tx) => {
    const [campaignSnap, userSnap] = await Promise.all([tx.get(campaignRef()), tx.get(userRef)]);
    const currentCampaign = parseCampaign(
      campaignSnap.exists ? (campaignSnap.data() as Record<string, unknown>) : undefined
    );
    const remainingBefore = Math.max(0, currentCampaign.maxFreeAccounts - currentCampaign.claimedCount);
    if (!currentCampaign.active || remainingBefore <= 0) {
      throw new Error("This launch offer is no longer available.");
    }

    const userRaw = (userSnap.data() || {}) as Record<string, unknown>;
    if (userAlreadyHasPaidTier(userRaw)) {
      return { ok: true as const, alreadyGranted: true, remaining: remainingBefore };
    }

    const initMs = currentCampaign.initializedAt?.toMillis?.() ?? 0;
    const createdMs = userCreatedAtMs(userRaw);
    const countedInBaseline = initMs > 0 && createdMs > 0 && createdMs <= initMs;
    const shouldIncrement = !countedInBaseline;

    if (shouldIncrement && currentCampaign.claimedCount >= currentCampaign.maxFreeAccounts) {
      throw new Error("All launch accounts have been claimed.");
    }

    const nextClaimed = shouldIncrement ? currentCampaign.claimedCount + 1 : currentCampaign.claimedCount;

    tx.set(
      campaignRef(),
      {
        claimedCount: nextClaimed,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(
      userRef,
      {
        subscriptionTier: "pro",
        subscriptionStatus: "active",
        launchCampaignPro: true,
        launchCampaignClaimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    const remaining = Math.max(0, currentCampaign.maxFreeAccounts - nextClaimed);
    return { ok: true as const, alreadyGranted: false, remaining };
  }).then(async (result) => {
    if (!result.alreadyGranted) {
      await applyBillingDerivedDailyTokenLimit(uid);
    }
    return result;
  });
}
