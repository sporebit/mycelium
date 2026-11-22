/**
 * Importing this file registers every job handler. The worker routes import
 * it for the side effect, so a job kind exists as soon as its feature's
 * handler module is listed here.
 */
import "./handlers";
import "@/lib/capture/jobs";
import "@/lib/daily/firstSteps";
import "@/lib/finds/verdict";
import "@/lib/finds/audit";
import "@/lib/speech/server";
import "@/lib/reference/jobs";
import "@/lib/family/calendar/sync";
