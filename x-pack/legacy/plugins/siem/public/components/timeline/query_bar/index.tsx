/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { isEqual, isEmpty } from 'lodash/fp';
import React, { memo, useCallback, useState, useEffect } from 'react';
import { StaticIndexPattern } from 'ui/index_patterns';
import { Query } from 'src/plugins/data/common/types';
import { Subscription } from 'rxjs';

import { SavedQueryTimeFilter } from '../../../../../../../../src/legacy/core_plugins/data/public/search';
import { SavedQuery } from '../../../../../../../../src/legacy/core_plugins/data/public';
import { FilterManager } from '../../../../../../../../src/plugins/data/public';
import {
  Filter,
  FilterStateStore,
} from '../../../../../../../../src/plugins/data/common/es_query/filters';

import { BrowserFields } from '../../../containers/source';
import { convertKueryToElasticSearchQuery } from '../../../lib/keury';
import { useKibanaCore } from '../../../lib/compose/kibana_core';
import { KueryFilterQuery, KueryFilterQueryKind } from '../../../store';
import { KqlMode } from '../../../store/timeline/model';
import { useSavedQueryServices } from '../../../utils/saved_query_services';
import { DispatchUpdateReduxTime } from '../../super_date_picker';
import { QueryBar } from '../../query_bar';
import { DataProvider } from '../data_providers/data_provider';
import { buildGlobalQuery } from '../helpers';

export interface QueryBarTimelineComponentProps {
  applyKqlFilterQuery: (expression: string, kind: KueryFilterQueryKind) => void;
  browserFields: BrowserFields;
  dataProviders: DataProvider[];
  filters: Filter[];
  filterQuery: KueryFilterQuery;
  filterQueryDraft: KueryFilterQuery;
  from: number;
  fromStr: string;
  kqlMode: KqlMode;
  indexPattern: StaticIndexPattern;
  isRefreshPaused: boolean;
  refreshInterval: number;
  savedQueryId: string | null;
  setFilters: (filters: Filter[]) => void;
  setKqlFilterQueryDraft: (expression: string, kind: KueryFilterQueryKind) => void;
  setSavedQueryId: (savedQueryId: string | null) => void;
  timelineId: string;
  to: number;
  toStr: string;
  updateReduxTime: DispatchUpdateReduxTime;
}

const timelineFilterDropArea = 'timeline-filter-drop-area';

export const QueryBarTimeline = memo<QueryBarTimelineComponentProps>(
  ({
    applyKqlFilterQuery,
    browserFields,
    dataProviders,
    filters,
    filterQuery,
    filterQueryDraft,
    from,
    fromStr,
    kqlMode,
    indexPattern,
    isRefreshPaused,
    savedQueryId,
    setFilters,
    setKqlFilterQueryDraft,
    setSavedQueryId,
    refreshInterval,
    timelineId,
    to,
    toStr,
    updateReduxTime,
  }) => {
    const [dateRangeFrom, setDateRangeFrom] = useState<string>(
      fromStr != null ? fromStr : new Date(from).toISOString()
    );
    const [dateRangeTo, setDateRangTo] = useState<string>(
      toStr != null ? toStr : new Date(to).toISOString()
    );

    const [savedQuery, setSavedQuery] = useState<SavedQuery | null>(null);
    const [filterQueryConverted, setFilterQueryConverted] = useState<Query>({
      query: filterQuery != null ? filterQuery.expression : '',
      language: filterQuery != null ? filterQuery.kind : 'kuery',
    });
    const [queryBarFilters, setQueryBarFilters] = useState<Filter[]>([]);
    const [dataProvidersDsl, setDataProvidersDsl] = useState<string>(
      convertKueryToElasticSearchQuery(buildGlobalQuery(dataProviders, browserFields), indexPattern)
    );
    const core = useKibanaCore();
    const [filterManager] = useState<FilterManager>(new FilterManager(core.uiSettings));

    const savedQueryServices = useSavedQueryServices();

    useEffect(() => {
      let isSubscribed = true;
      const subscriptions = new Subscription();
      filterManager.setFilters(filters);

      subscriptions.add(
        filterManager.getUpdates$().subscribe({
          next: () => {
            if (isSubscribed) {
              const filterWithoutDropArea = filterManager
                .getFilters()
                .filter((f: Filter) => f.meta.controlledBy !== timelineFilterDropArea);
              setFilters(filterWithoutDropArea);
              setQueryBarFilters(filterWithoutDropArea);
            }
          },
        })
      );

      return () => {
        isSubscribed = false;
        subscriptions.unsubscribe();
      };
    }, []);

    useEffect(() => {
      const filterWithoutDropArea = filterManager
        .getFilters()
        .filter((f: Filter) => f.meta.controlledBy !== timelineFilterDropArea);
      if (!isEqual(filters, filterWithoutDropArea)) {
        filterManager.setFilters(filters);
      }
    }, [filters]);

    useEffect(() => {
      setFilterQueryConverted({
        query: filterQuery != null ? filterQuery.expression : '',
        language: filterQuery != null ? filterQuery.kind : 'kuery',
      });
    }, [filterQuery]);

    useEffect(() => {
      setDataProvidersDsl(
        convertKueryToElasticSearchQuery(
          buildGlobalQuery(dataProviders, browserFields),
          indexPattern
        )
      );
    }, [dataProviders, browserFields, indexPattern]);

    useEffect(() => {
      if (fromStr != null && toStr != null) {
        setDateRangeFrom(fromStr);
        setDateRangTo(toStr);
      } else if (from != null && to != null) {
        setDateRangeFrom(new Date(from).toISOString());
        setDateRangTo(new Date(to).toISOString());
      }
    }, [from, fromStr, to, toStr]);

    useEffect(() => {
      let isSubscribed = true;
      async function setSavedQueryByServices() {
        if (savedQueryId != null && savedQueryServices != null) {
          const mySavedQuery = await savedQueryServices.getSavedQuery(savedQueryId);
          if (isSubscribed) {
            setSavedQuery({
              ...mySavedQuery,
              attributes: {
                ...mySavedQuery.attributes,
                filters: filters.filter(f => f.meta.controlledBy !== timelineFilterDropArea),
              },
            });
          }
        } else if (isSubscribed) {
          setSavedQuery(null);
        }
      }
      setSavedQueryByServices();
      return () => {
        isSubscribed = false;
      };
    }, [savedQueryId]);

    const onChangedQuery = useCallback(
      (newQuery: Query) => {
        if (
          filterQueryDraft == null ||
          (filterQueryDraft != null && filterQueryDraft.expression !== newQuery.query) ||
          filterQueryDraft.kind !== newQuery.language
        ) {
          setKqlFilterQueryDraft(
            newQuery.query as string,
            newQuery.language as KueryFilterQueryKind
          );
        }
      },
      [filterQueryDraft]
    );

    const onSubmitQuery = useCallback(
      (newQuery: Query, timefilter?: SavedQueryTimeFilter) => {
        if (
          filterQuery == null ||
          (filterQuery != null && filterQuery.expression !== newQuery.query) ||
          filterQuery.kind !== newQuery.language
        ) {
          setKqlFilterQueryDraft(
            newQuery.query as string,
            newQuery.language as KueryFilterQueryKind
          );
          applyKqlFilterQuery(newQuery.query as string, newQuery.language as KueryFilterQueryKind);
        }
        if (timefilter != null) {
          const isQuickSelection = timefilter.from.includes('now') || timefilter.to.includes('now');

          updateReduxTime({
            id: 'timeline',
            end: timefilter.to,
            start: timefilter.from,
            isInvalid: false,
            isQuickSelection,
            timelineId,
          });
        }
      },
      [filterQuery, timelineId]
    );

    const onSavedQuery = useCallback(
      (newSavedQuery: SavedQuery | null) => {
        if (newSavedQuery != null) {
          if (newSavedQuery.id !== savedQueryId) {
            setSavedQueryId(newSavedQuery.id);
          }
          if (savedQueryServices != null && dataProvidersDsl !== '') {
            const dataProviderFilterExists =
              newSavedQuery.attributes.filters != null
                ? newSavedQuery.attributes.filters.findIndex(
                    f => f.meta.controlledBy === timelineFilterDropArea
                  )
                : -1;
            savedQueryServices.saveQuery(
              {
                ...newSavedQuery.attributes,
                filters:
                  newSavedQuery.attributes.filters != null
                    ? dataProviderFilterExists > -1
                      ? [
                          ...newSavedQuery.attributes.filters.slice(0, dataProviderFilterExists),
                          getDataProviderFilter(dataProvidersDsl),
                          ...newSavedQuery.attributes.filters.slice(dataProviderFilterExists + 1),
                        ]
                      : [
                          ...newSavedQuery.attributes.filters,
                          getDataProviderFilter(dataProvidersDsl),
                        ]
                    : [],
              },
              {
                overwrite: true,
              }
            );
          }
        } else {
          setSavedQueryId(null);
        }
      },
      [dataProvidersDsl, savedQueryId, savedQueryServices]
    );

    return (
      <QueryBar
        dateRangeFrom={dateRangeFrom}
        dateRangeTo={dateRangeTo}
        hideSavedQuery={kqlMode === 'search'}
        indexPattern={indexPattern}
        isRefreshPaused={isRefreshPaused}
        filterQuery={filterQueryConverted}
        filterManager={filterManager}
        filters={queryBarFilters}
        onChangedQuery={onChangedQuery}
        onSubmitQuery={onSubmitQuery}
        refreshInterval={refreshInterval}
        savedQuery={savedQuery}
        onSavedQuery={onSavedQuery}
      />
    );
  }
);

export const getDataProviderFilter = (dataProviderDsl: string): Filter => {
  const dslObject = JSON.parse(dataProviderDsl);
  const key = Object.keys(dslObject);
  return {
    ...dslObject,
    meta: {
      alias: timelineFilterDropArea,
      controlledBy: timelineFilterDropArea,
      negate: false,
      disabled: false,
      type: 'custom',
      key: isEmpty(key) ? 'bool' : key[0],
      value: dataProviderDsl,
    },
    $state: {
      store: FilterStateStore.APP_STATE,
    },
  };
};
