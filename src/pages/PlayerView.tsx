import { RunOutput } from "@movie-web/providers";
import { useCallback, useEffect, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAsync } from "react-use";

import {
  decodeJellyfinId,
  getJellyfinMovieMeta,
  getJellyfinPlaybackSource,
  getJellyfinShowMeta,
  isJellyfinEnabled,
} from "@/backend/jellyfin";
import { usePlayer } from "@/components/player/hooks/usePlayer";
import { usePlayerMeta } from "@/components/player/hooks/usePlayerMeta";
import { convertProviderCaption } from "@/components/player/utils/captions";
import { convertRunoutputToSource } from "@/components/player/utils/convertRunoutputToSource";
import { MWMediaType } from "@/backend/metadata/types/mw";
import { Loading } from "@/components/layout/Loading";
import { ScrapingItems, ScrapingSegment } from "@/hooks/useProviderScrape";
import { useQueryParam } from "@/hooks/useQueryParams";
import { ErrorContainer, ErrorLayout } from "@/pages/layouts/ErrorLayout";
import { MetaPart } from "@/pages/parts/player/MetaPart";
import { PlaybackErrorPart } from "@/pages/parts/player/PlaybackErrorPart";
import { PlayerPart } from "@/pages/parts/player/PlayerPart";
import { ScrapeErrorPart } from "@/pages/parts/player/ScrapeErrorPart";
import { ScrapingPart } from "@/pages/parts/player/ScrapingPart";
import { useLastNonPlayerLink } from "@/stores/history";
import { PlayerMeta, playerStatus } from "@/stores/player/slices/source";
import { needsOnboarding } from "@/utils/onboarding";
import { parseTimestamp } from "@/utils/timestamp";

export function RealPlayerView() {
  const navigate = useNavigate();
  const params = useParams<{
    media: string;
    episode?: string;
    season?: string;
  }>();
  const [errorData, setErrorData] = useState<{
    sources: Record<string, ScrapingSegment>;
    sourceOrder: ScrapingItems[];
  } | null>(null);
  const [startAtParam] = useQueryParam("t");
  const {
    status,
    playMedia,
    reset,
    setScrapeNotFound,
    shouldStartFromBeginning,
    setShouldStartFromBeginning,
  } = usePlayer();
  const { setPlayerMeta, scrapeMedia } = usePlayerMeta();
  const backUrl = useLastNonPlayerLink();

  const paramsData = JSON.stringify({
    media: params.media,
    season: params.season,
    episode: params.episode,
  });
  useEffect(() => {
    reset();
  }, [paramsData, reset]);

  const metaChange = useCallback(
    (meta: PlayerMeta) => {
      if (meta?.type === "show")
        navigate(
          `/media/${params.media}/${meta.season?.tmdbId}/${meta.episode?.tmdbId}`,
        );
      else navigate(`/media/${params.media}`);
    },
    [navigate, params],
  );

  const playAfterScrape = useCallback(
    (out: RunOutput | null) => {
      if (!out) return;

      let startAt: number | undefined;
      if (startAtParam) startAt = parseTimestamp(startAtParam) ?? undefined;

      playMedia(
        convertRunoutputToSource(out),
        convertProviderCaption(out.stream.captions),
        out.sourceId,
        shouldStartFromBeginning ? 0 : startAt,
      );
      setShouldStartFromBeginning(false);
    },
    [
      playMedia,
      startAtParam,
      shouldStartFromBeginning,
      setShouldStartFromBeginning,
    ],
  );

  return (
    <PlayerPart backUrl={backUrl} onMetaChange={metaChange}>
      {status === playerStatus.IDLE ? (
        <MetaPart onGetMeta={setPlayerMeta} />
      ) : null}
      {status === playerStatus.SCRAPING && scrapeMedia ? (
        <ScrapingPart
          media={scrapeMedia}
          onResult={(sources, sourceOrder) => {
            setErrorData({
              sourceOrder,
              sources,
            });
            setScrapeNotFound();
          }}
          onGetStream={playAfterScrape}
        />
      ) : null}
      {status === playerStatus.SCRAPE_NOT_FOUND && errorData ? (
        <ScrapeErrorPart data={errorData} />
      ) : null}
      {status === playerStatus.PLAYBACK_ERROR ? <PlaybackErrorPart /> : null}
    </PlayerPart>
  );
}

function JellyfinPlayerView() {
  const navigate = useNavigate();
  const params = useParams<{
    media: string;
    episode?: string;
    season?: string;
  }>();
  const [startAtParam] = useQueryParam("t");
  const { setMeta, playMedia, reset, status } = usePlayer();
  const backUrl = useLastNonPlayerLink();

  const paramsData = JSON.stringify({
    media: params.media,
    season: params.season,
    episode: params.episode,
  });
  useEffect(() => {
    reset();
  }, [paramsData, reset]);

  const metaChange = useCallback(
    (meta: PlayerMeta) => {
      if (!params.media) return;
      if (meta.type === "show" && meta.season && meta.episode) {
        navigate(
          `/media/${params.media}/${encodeURIComponent(meta.season.tmdbId)}/${encodeURIComponent(meta.episode.tmdbId)}`,
        );
      } else {
        navigate(`/media/${params.media}`);
      }
    },
    [navigate, params.media],
  );

  const state = useAsync(async () => {
    if (!params.media) throw new Error("Missing media id");
    const decoded = decodeJellyfinId(params.media);
    if (!decoded) throw new Error("Invalid Jellyfin media id");

    const startAt = startAtParam ? parseTimestamp(startAtParam) ?? undefined : undefined;

    if (decoded.type === "movie") {
      const meta = await getJellyfinMovieMeta(decoded.id);
      const playerMeta: PlayerMeta = {
        type: "movie",
        title: meta.meta.title,
        releaseYear: +(meta.meta.year ?? 0),
        poster: meta.meta.poster,
        tmdbId: meta.meta.id,
        imdbId: meta.imdbId,
      };
      setMeta(playerMeta);
      playMedia(await getJellyfinPlaybackSource(decoded.id), [], decoded.id, startAt);
      return;
    }

    const detail = await getJellyfinShowMeta(decoded.id, params.season);
    if (detail.meta.type !== MWMediaType.SERIES) {
      throw new Error("Expected Jellyfin series metadata");
    }
    const seasonData = detail.meta.seasonData;
    const chosenEpisode =
      seasonData.episodes.find((episode) => episode.id === params.episode) ??
      seasonData.episodes[0];
    if (!chosenEpisode) throw new Error("No Jellyfin episodes found");

    if (
      params.season !== seasonData.id ||
      params.episode !== chosenEpisode.id
    ) {
      navigate(
        `/media/${params.media}/${encodeURIComponent(seasonData.id)}/${encodeURIComponent(chosenEpisode.id)}`,
        { replace: true },
      );
    }

    const playerMeta: PlayerMeta = {
      type: "show",
      title: detail.meta.title,
      releaseYear: +(detail.meta.year ?? 0),
      poster: detail.meta.poster,
      tmdbId: detail.meta.id,
      imdbId: detail.imdbId,
      episodes: seasonData.episodes.map((episode) => ({
        number: episode.number,
        title: episode.title,
        tmdbId: episode.id,
      })),
      episode: {
        number: chosenEpisode.number,
        title: chosenEpisode.title,
        tmdbId: chosenEpisode.id,
      },
      season: {
        number: seasonData.number,
        title: seasonData.title,
        tmdbId: seasonData.id,
      },
    };
    setMeta(playerMeta);
    playMedia(await getJellyfinPlaybackSource(chosenEpisode.id), [], chosenEpisode.id, startAt);
  }, [paramsData, startAtParam]);

  return (
    <PlayerPart backUrl={backUrl} onMetaChange={metaChange}>
      {state.loading ? (
        <ErrorLayout>
          <div className="flex items-center justify-center">
            <Loading />
          </div>
        </ErrorLayout>
      ) : null}
      {state.error ? (
        <ErrorLayout>
          <ErrorContainer>
            <p>{state.error.message}</p>
          </ErrorContainer>
        </ErrorLayout>
      ) : null}
      {status === playerStatus.PLAYBACK_ERROR ? <PlaybackErrorPart /> : null}
    </PlayerPart>
  );
}

export function PlayerView() {
  const loc = useLocation();
  const { loading, error, value } = useAsync(() => {
    return needsOnboarding();
  });

  if (error) throw new Error("Failed to detect onboarding");
  if (loading) return null;
  if (value)
    return (
      <Navigate
        replace
        to={{
          pathname: "/onboarding",
          search: `redirect=${encodeURIComponent(loc.pathname)}`,
        }}
      />
    );
  if (isJellyfinEnabled()) {
    const decoded = decodeJellyfinId(loc.pathname.split("/media/")[1]?.split("/")[0] ?? "");
    if (decoded) return <JellyfinPlayerView />;
  }
  return <RealPlayerView />;
}

export default PlayerView;
