import { applicationRuntimeFor } from "@pcobooster/api/application/runtime";
import type { ApplicationRuntime } from "@pcobooster/api/application/runtime";
import { unreachableHttpClient } from "@pcobooster/api/testing/http-client";
import { Context } from "effect";
import * as HttpClient from "effect/http/HttpClient";

/** A request runtime for tests; stubbed services mean no request should reach `fetch`. */
export const testRuntime = (
  httpClient: HttpClient.HttpClient = unreachableHttpClient
): ApplicationRuntime<HttpClient.HttpClient> =>
  applicationRuntimeFor(Context.make(HttpClient.HttpClient, httpClient));
