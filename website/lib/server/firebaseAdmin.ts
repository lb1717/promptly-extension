import { App, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountShape = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

function getServiceAccount(): ServiceAccountShape {
  const json = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (json) {
    const parsed = JSON.parse(json);
    return {
      projectId: String(parsed.project_id || parsed.projectId || "").trim(),
      clientEmail: String(parsed.client_email || parsed.clientEmail || "").trim(),
      privateKey: String(parsed.private_key || parsed.privateKey || "").replace(/\\n/g, "\n")
    };
  }

  return {
    projectId: String(process.env.FIREBASE_ADMIN_PROJECT_ID || "").trim(),
    clientEmail: String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim(),
    privateKey: String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };
}

function required(name: string, value: string | undefined) {
  const next = String(value || "").trim();
  if (!next) {
    throw new Error(`Missing ${name}`);
  }
  return next;
}

export function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const account = getServiceAccount();
  return initializeApp({
    credential: cert({
      projectId: required("FIREBASE_ADMIN_PROJECT_ID", account.projectId),
      clientEmail: required("FIREBASE_ADMIN_CLIENT_EMAIL", account.clientEmail),
      privateKey: required("FIREBASE_ADMIN_PRIVATE_KEY", account.privateKey)
    })
  });
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}
