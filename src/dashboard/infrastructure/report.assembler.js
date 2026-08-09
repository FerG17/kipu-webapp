import { Report }        from '../domain/model/report.entity.js';
import { ReportFilters } from '../domain/model/report-filters.entity.js';

/**
 * Maps raw API resources into Report domain entities and vice versa.
 *
 * @class ReportAssembler
 */
export class ReportAssembler {
    /**
     * Converts a single API resource object into a Report entity.
     * Reconstructs the nested ReportFilters value object when present.
     *
     * @param {Object} resource - Raw resource object from the API response.
     * @returns {Report} The corresponding domain entity.
     */
    static toEntityFromResource(resource) {
        const filters = resource.filters
            ? new ReportFilters(resource.filters)
            : new ReportFilters({});
        return new Report({ ...resource, filters });
    }

    /**
     * Converts an Axios response containing a collection of report resources
     * into an array of Report entities.
     * Logs an error and returns an empty array when the response status is not 200.
     *
     * @param {import('axios').AxiosResponse} response - HTTP response with report resources.
     * @returns {Report[]} Array of Report entities.
     */
    static toEntitiesFromResponse(response) {
        if (response.status !== 200) {
            console.error(`ReportAssembler error — status: ${response.status}, message: ${response.statusText}`);
            return [];
        }
        const resources = response.data instanceof Array
            ? response.data
            : response.data['reports'];
        return resources.map(resource => this.toEntityFromResource(resource));
    }
}