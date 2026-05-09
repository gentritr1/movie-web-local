import { useTranslation } from "react-i18next";
import { useAsync } from "react-use";

import { getLatestJellyfinMedia } from "@/backend/jellyfin";
import { Icons } from "@/components/Icon";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { MediaGrid } from "@/components/media/MediaGrid";
import { WatchedMediaCard } from "@/components/media/WatchedMediaCard";
import { Paragraph } from "@/components/text/Paragraph";
import { SearchLoadingPart } from "@/pages/parts/search/SearchLoadingPart";

export function JellyfinPart() {
  const { t } = useTranslation();
  const state = useAsync(() => getLatestJellyfinMedia(), []);

  if (state.loading) return <SearchLoadingPart />;
  if (state.error) {
    return (
      <div className="py-10">
        <Paragraph>{t("home.search.failed")}</Paragraph>
      </div>
    );
  }

  const items = state.value ?? [];
  if (items.length === 0) {
    return (
      <div className="py-10">
        <Paragraph>No Jellyfin items found.</Paragraph>
      </div>
    );
  }

  return (
    <div>
      <SectionHeading title="Recently added" icon={Icons.CLOCK} />
      <MediaGrid>
        {items.map((item) => (
          <WatchedMediaCard key={item.id} media={item} />
        ))}
      </MediaGrid>
    </div>
  );
}
