import slugify from "slugify";

import { DetailedMeta, MWMediaMeta, MWMediaType } from "@/backend/metadata/types/mw";
import { SourceSliceSource } from "@/stores/player/utils/qualities";
import { conf } from "@/setup/config";
import { MediaItem } from "@/utils/mediaTypes";

const deviceIdKey = "jellyfin-device-id";

type JellyfinSession = {
  accessToken: string;
  userId: string;
};

type JellyfinAuthenticateResponse = {
  AccessToken: string;
  User: {
    Id: string;
  };
};

type JellyfinItem = {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  PremiereDate?: string;
  ImageTags?: {
    Primary?: string;
  };
  ParentIndexNumber?: number;
  IndexNumber?: number;
  SeriesName?: string;
  ProviderIds?: Record<string, string>;
};

type JellyfinItemsResponse = {
  Items: JellyfinItem[];
};

type JellyfinPlaybackInfoResponse = {
  MediaSources?: Array<{
    Id: string;
  }>;
};

let cachedSession: JellyfinSession | null = null;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function getDeviceId(): string {
  const existing = localStorage.getItem(deviceIdKey);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  localStorage.setItem(deviceIdKey, generated);
  return generated;
}

function getAuthorizationHeader(token?: string) {
  const client = `MediaBrowser Client="movie-web", Device="Browser", DeviceId="${getDeviceId()}", Version="1.0.0"`;
  if (!token) return client;
  return `${client}, Token="${token}"`;
}

function getServerUrl(): string {
  const value = conf().JELLYFIN_SERVER_URL;
  if (!value) throw new Error("Jellyfin server URL not configured");
  return trimTrailingSlash(value);
}

function getImageUrl(item: JellyfinItem): string | undefined {
  if (!item.ImageTags?.Primary) return undefined;
  const server = getServerUrl();
  const tag = encodeURIComponent(item.ImageTags.Primary);
  return `${server}/Items/${encodeURIComponent(item.Id)}/Images/Primary?fillHeight=600&fillWidth=400&quality=90&tag=${tag}`;
}

async function jellyfinFetch<T>(
  path: string,
  init?: RequestInit,
  auth?: JellyfinSession,
): Promise<T> {
  const url = `${getServerUrl()}${path}`;
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Emby-Authorization", getAuthorizationHeader(auth?.accessToken));
  if (auth?.accessToken) headers.set("X-Emby-Token", auth.accessToken);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(`Jellyfin request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function authenticateByCredentials(): Promise<JellyfinSession> {
  const runtime = conf();
  if (!runtime.JELLYFIN_USERNAME || !runtime.JELLYFIN_PASSWORD) {
    throw new Error("Jellyfin credentials not configured");
  }
  const result = await jellyfinFetch<JellyfinAuthenticateResponse>(
    "/Users/AuthenticateByName",
    {
      method: "POST",
      body: JSON.stringify({
        Username: runtime.JELLYFIN_USERNAME,
        Pw: runtime.JELLYFIN_PASSWORD,
      }),
    },
  );
  return {
    accessToken: result.AccessToken,
    userId: result.User.Id,
  };
}

export function isJellyfinEnabled(): boolean {
  return Boolean(
    conf().JELLYFIN_SERVER_URL &&
      ((conf().JELLYFIN_USERNAME && conf().JELLYFIN_PASSWORD) ||
        (conf().JELLYFIN_TOKEN && conf().JELLYFIN_USER_ID)),
  );
}

export async function getJellyfinSession(): Promise<JellyfinSession> {
  if (!isJellyfinEnabled()) {
    throw new Error("Jellyfin is not configured");
  }
  if (cachedSession) return cachedSession;

  const runtime = conf();
  if (runtime.JELLYFIN_TOKEN && runtime.JELLYFIN_USER_ID) {
    cachedSession = {
      accessToken: runtime.JELLYFIN_TOKEN,
      userId: runtime.JELLYFIN_USER_ID,
    };
    return cachedSession;
  }

  cachedSession = await authenticateByCredentials();
  return cachedSession;
}

function itemTypeToMediaType(type: JellyfinItem["Type"]): MediaItem["type"] | null {
  if (type === "Movie") return "movie";
  if (type === "Series") return "show";
  return null;
}

export function jellyfinMediaItemToId(media: MediaItem): string {
  return [
    "jf",
    media.type,
    media.id,
    slugify(media.title, { lower: true, strict: true }),
  ].join("-");
}

export function decodeJellyfinId(
  paramId: string,
): { id: string; type: MediaItem["type"] } | null {
  const [prefix, type, id] = paramId.split("-", 4);
  if (prefix !== "jf") return null;
  if (type !== "movie" && type !== "show") return null;
  if (!id) return null;
  return {
    id,
    type,
  };
}

function itemToMediaItem(item: JellyfinItem): MediaItem | null {
  const type = itemTypeToMediaType(item.Type);
  if (!type) return null;
  return {
    id: item.Id,
    title: item.Name,
    year: item.ProductionYear,
    release_date: item.PremiereDate ? new Date(item.PremiereDate) : undefined,
    poster: getImageUrl(item),
    type,
  };
}

export async function searchJellyfinMedia(query: string): Promise<MediaItem[]> {
  const session = await getJellyfinSession();
  const params = new URLSearchParams({
    SearchTerm: query,
    Recursive: "true",
    IncludeItemTypes: "Movie,Series",
    Fields: "ProviderIds,PremiereDate,ProductionYear",
    Limit: "60",
  });
  const response = await jellyfinFetch<JellyfinItemsResponse>(
    `/Users/${encodeURIComponent(session.userId)}/Items?${params.toString()}`,
    undefined,
    session,
  );
  return response.Items.map(itemToMediaItem).filter((v): v is MediaItem => Boolean(v));
}

export async function getLatestJellyfinMedia(): Promise<MediaItem[]> {
  const session = await getJellyfinSession();
  const params = new URLSearchParams({
    userId: session.userId,
    IncludeItemTypes: "Movie,Series",
    Limit: "24",
    Fields: "ProviderIds,PremiereDate,ProductionYear",
  });
  const items = await jellyfinFetch<JellyfinItem[]>(
    `/Users/${encodeURIComponent(session.userId)}/Items/Latest?${params.toString()}`,
    undefined,
    session,
  );
  return items.map(itemToMediaItem).filter((v): v is MediaItem => Boolean(v));
}

async function getItem(id: string): Promise<JellyfinItem> {
  const session = await getJellyfinSession();
  return jellyfinFetch<JellyfinItem>(
    `/Users/${encodeURIComponent(session.userId)}/Items/${encodeURIComponent(id)}`,
    undefined,
    session,
  );
}

async function getShowSeasons(id: string): Promise<JellyfinItem[]> {
  const session = await getJellyfinSession();
  const params = new URLSearchParams({
    userId: session.userId,
    Fields: "PremiereDate,ProductionYear",
  });
  const response = await jellyfinFetch<JellyfinItemsResponse>(
    `/Shows/${encodeURIComponent(id)}/Seasons?${params.toString()}`,
    undefined,
    session,
  );
  return response.Items;
}

async function getShowEpisodes(seriesId: string, seasonId: string): Promise<JellyfinItem[]> {
  const session = await getJellyfinSession();
  const params = new URLSearchParams({
    userId: session.userId,
    seasonId,
    Fields: "PremiereDate,ProductionYear,ProviderIds",
  });
  const response = await jellyfinFetch<JellyfinItemsResponse>(
    `/Shows/${encodeURIComponent(seriesId)}/Episodes?${params.toString()}`,
    undefined,
    session,
  );
  return response.Items;
}

export async function getJellyfinMovieMeta(id: string): Promise<DetailedMeta> {
  const item = await getItem(id);
  const meta: MWMediaMeta = {
    type: MWMediaType.MOVIE,
    id: item.Id,
    title: item.Name,
    year: item.ProductionYear?.toString(),
    poster: getImageUrl(item),
    seasons: undefined,
  };
  return {
    meta,
    imdbId: item.ProviderIds?.Imdb,
    tmdbId: item.Id,
  };
}

export async function getJellyfinShowMeta(
  seriesId: string,
  seasonId?: string,
): Promise<DetailedMeta> {
  const [series, seasons] = await Promise.all([getItem(seriesId), getShowSeasons(seriesId)]);
  const selectedSeason = seasons.find((season) => season.Id === seasonId) ?? seasons[0];
  if (!selectedSeason) {
    throw new Error("No Jellyfin seasons found");
  }
  const episodes = await getShowEpisodes(seriesId, selectedSeason.Id);
  const meta: MWMediaMeta = {
    type: MWMediaType.SERIES,
    id: series.Id,
    title: series.Name,
    year: series.ProductionYear?.toString(),
    poster: getImageUrl(series),
    seasons: seasons.map((season) => ({
      id: season.Id,
      number: season.IndexNumber ?? 1,
      title: season.Name,
    })),
    seasonData: {
      id: selectedSeason.Id,
      number: selectedSeason.IndexNumber ?? 1,
      title: selectedSeason.Name,
      episodes: episodes.map((episode) => ({
        id: episode.Id,
        number: episode.IndexNumber ?? 1,
        title: episode.Name,
        air_date: episode.PremiereDate ?? "",
      })),
    },
  };
  return {
    meta,
    imdbId: series.ProviderIds?.Imdb,
    tmdbId: series.Id,
  };
}

async function getPlaybackInfo(itemId: string): Promise<JellyfinPlaybackInfoResponse> {
  const session = await getJellyfinSession();
  return jellyfinFetch<JellyfinPlaybackInfoResponse>(
    `/Items/${encodeURIComponent(itemId)}/PlaybackInfo?UserId=${encodeURIComponent(session.userId)}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    session,
  );
}

export async function getJellyfinPlaybackSource(itemId: string): Promise<SourceSliceSource> {
  const [session, playbackInfo] = await Promise.all([
    getJellyfinSession(),
    getPlaybackInfo(itemId),
  ]);
  const mediaSourceId = playbackInfo.MediaSources?.[0]?.Id;
  const params = new URLSearchParams({
    api_key: session.accessToken,
    UserId: session.userId,
    DeviceId: getDeviceId(),
    EnableSubtitlesInManifest: "true",
    SubtitleMethod: "Embed",
    TranscodingMaxAudioChannels: "6",
  });
  if (mediaSourceId) {
    params.set("MediaSourceId", mediaSourceId);
  }
  return {
    type: "hls",
    url: `${getServerUrl()}/Videos/${encodeURIComponent(itemId)}/master.m3u8?${params.toString()}`,
  };
}
