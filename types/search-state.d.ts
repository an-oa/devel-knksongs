/** `YYYYMMDD` を数値化した日付キー。 */
type DateKey = number;

/** 検索ロジックとUIが共有する検索条件。 */
type SearchState = {
  queryRaw: string;
  dateFromKey: DateKey | null;
  dateToKey: DateKey | null;
  hasDateFilter: boolean;
  collabHostOnly?: boolean;
  collabGuestOnly?: boolean;
  relayOnly?: boolean;
  harmonyOnly?: boolean;
};
