import React from "react";

export type NestedRoute = {
  path: string;
  element: JSX.Element;
  name: string;
  icon?: React.FC;
  devOnly?: boolean;
};
export const isNestedRoute = (route: NestedRouteElement): route is NestedRoute => {
  return (route as NestedRoute).path !== undefined;
};

export type NestedSubRoute = {
  name: string;
  icon?: React.FC;
  routes: NestedRouteElement[];
  devOnly?: boolean;
  /**
   * Use the compact row of links at every width, never the 208px column.
   *
   * For sections holding a couple of wide pages, where a second vertical
   * nav beside the rail costs more width than choosing between two things
   * is worth. Settings has a dozen pages and earns its column; a section
   * with two does not.
   */
  compactNavOnly?: boolean;
};
export const isNestedSubRoute = (route: NestedRouteElement): route is NestedSubRoute => {
  return (route as NestedSubRoute).routes !== undefined;
};

export type NestedRouteElement = NestedRoute | NestedSubRoute;

/*
 * The nested-accordion renderer that used to live here is gone: sections are
 * rendered by SectionNav inside the page they belong to now, so the rail only
 * carries five top-level destinations. The route *data* above is unchanged and
 * is still what both the router and the sub-nav are built from.
 */
