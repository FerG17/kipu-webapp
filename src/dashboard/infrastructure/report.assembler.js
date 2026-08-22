import { Report } from '../domain/model/report.entity.js';

/**
 * Maps raw ReportResource API objects into Report domain entities.
 *
 * @class ReportAssembler
 */
export class ReportAssembler {
    /**
     * @param {Object} resource - Raw ReportResource object from the API response.
     * @returns {Report}
     */
    static toEntityFromResource(resource) {
        return new Report(resource);
    }

    /**
     * @param {import('axios').AxiosResponse} response - HTTP response with a collection of report resources.
     * @returns {Report[]}
     */
    static toEntitiesFromResponse(response) {
        const resources = response.data instanceof Array ? response.data : [];
        return resources.map(resource => this.toEntityFromResource(resource));
    }
}
