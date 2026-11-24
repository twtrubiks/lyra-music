/** A pending "scroll this track into view" request, picked up by the shown track list. */
export interface RevealRequest {
  trackId: number;
  /** `Date.now()` when requested; see `isRevealFresh`. */
  at: number;
}

let request = $state<RevealRequest | null>(null);

// Not reactive: only read on demand to answer "does the shown list have this track?"
let listing: (() => readonly { id: number }[]) | null = null;

export function getRevealState() {
  return {
    get request() {
      return request;
    },
    set request(v: RevealRequest | null) {
      request = v;
    },
  };
}

/** The mounted track list reports what it shows. Returns an unregister function. */
export function registerRevealListing(getTracks: () => readonly { id: number }[]): () => void {
  listing = getTracks;
  return () => {
    if (listing === getTracks) listing = null;
  };
}

export function isListedInView(trackId: number): boolean {
  return listing?.().some((track) => track.id === trackId) ?? false;
}
