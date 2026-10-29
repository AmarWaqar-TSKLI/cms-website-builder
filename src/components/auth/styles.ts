/**
 * The auth family's form vocabulary, taken from the sign-in form so every
 * account screen (sign in, sign up, reset, invite) is the same printed card:
 * a white sheet with an ink border on a hard ink shadow, mono kicker labels,
 * paper-filled inputs, and the tomato poster button.
 */
export const AUTH_CARD = "border-2 border-coal bg-white p-6 shadow-[6px_6px_0_var(--color-coal)]";
export const AUTH_LABEL = "kicker mb-1.5 block text-coal/70";
export const AUTH_INPUT =
  "w-full border-2 border-coal bg-paper px-3 py-2.5 text-[15px] text-coal outline-none placeholder:text-coal/40 focus:bg-white";
export const AUTH_BUTTON =
  "btn-poster w-full justify-center bg-tomato text-[15px] text-paper disabled:cursor-not-allowed disabled:opacity-50";
export const AUTH_ERROR = "border-2 border-tomato bg-tomato/10 px-3 py-2 text-[13.5px] text-tomato-deep";
export const AUTH_LINK = "font-semibold underline decoration-2 underline-offset-4 hover:text-tomato";
