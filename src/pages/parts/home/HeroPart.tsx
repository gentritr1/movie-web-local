import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowSize } from "react-use";

import { SearchBarInput } from "@/components/form/SearchBar";
import { ThinContainer } from "@/components/layout/ThinContainer";
import { useSlashFocus } from "@/components/player/hooks/useSlashFocus";
import { HeroTitle } from "@/components/text/HeroTitle";
import { useRandomTranslation } from "@/hooks/useRandomTranslation";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import { useBannerSize } from "@/stores/banner";

export interface HeroPartProps {
  setIsSticky: (val: boolean) => void;
  searchParams: ReturnType<typeof useSearchQuery>;
}

function getTimeOfDay(date: Date): "night" | "morning" | "day" {
  const hour = date.getHours();
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 19) return "day";
  return "night";
}

export function HeroPart({ setIsSticky, searchParams }: HeroPartProps) {
  const { t: randomT } = useRandomTranslation();
  const [search, setSearch, setSearchUnFocus] = searchParams;
  const bannerSize = useBannerSize();
  const stickyContainerRef = useRef<HTMLDivElement>(null);
  const stickStateChanged = useCallback(
    (isFixed: boolean) => {
      setIsSticky(isFixed);
    },
    [setIsSticky],
  );

  const { width: windowWidth } = useWindowSize();

  const topSpacing = 16;
  const [stickyOffset, setStickyOffset] = useState(topSpacing);
  useEffect(() => {
    if (windowWidth > 1200) {
      // On large screens the bar goes inline with the nav elements
      setStickyOffset(topSpacing);
    } else {
      // On smaller screens the bar goes below the nav elements
      setStickyOffset(topSpacing + 60);
    }
  }, [windowWidth]);

  useEffect(() => {
    function checkSticky() {
      const el = stickyContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      stickStateChanged(rect.top <= stickyOffset + bannerSize);
    }

    window.addEventListener("scroll", checkSticky, { passive: true });
    window.addEventListener("resize", checkSticky);
    checkSticky();

    return () => {
      window.removeEventListener("scroll", checkSticky);
      window.removeEventListener("resize", checkSticky);
    };
  }, [bannerSize, stickStateChanged, stickyOffset]);

  const time = getTimeOfDay(new Date());
  const title = randomT(`home.titles.${time}`);
  const placeholder = randomT(`home.search.placeholder`);
  const inputRef = useRef<HTMLInputElement>(null);
  useSlashFocus(inputRef);

  return (
    <ThinContainer>
      <div className="mt-44 space-y-16 text-center">
        <div className="relative z-10 mb-16">
          <HeroTitle className="mx-auto max-w-md">{title}</HeroTitle>
        </div>
        <div className="relative h-20 z-30">
          <div
            ref={stickyContainerRef}
            className="sticky"
            style={{
              top: `${stickyOffset + bannerSize}px`,
            }}
          >
            <SearchBarInput
              ref={inputRef}
              onChange={setSearch}
              value={search}
              onUnFocus={setSearchUnFocus}
              placeholder={placeholder ?? ""}
            />
          </div>
        </div>
      </div>
    </ThinContainer>
  );
}
