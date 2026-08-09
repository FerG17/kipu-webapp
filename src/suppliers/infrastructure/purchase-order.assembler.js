import { PurchaseOrder, PurchaseOrderDetail } from '../domain/model/purchase-order.entity.js';

/**
 * Assembler responsible for converting raw API resource objects
 * into PurchaseOrder and PurchaseOrderDetail domain entities and vice-versa.
 *
 * @class PurchaseOrderAssembler
 */
export class PurchaseOrderAssembler {

    /**
     * Converts a single raw purchase API resource into a PurchaseOrder entity.
     * Details array should be hydrated separately and passed in via `details`.
     *
     * @param {Object}              resource
     * @param {number}              resource.id
     * @param {number}              resource.businessId
     * @param {number}              resource.supplierId
     * @param {string}              [resource.supplierName]
     * @param {string}              resource.date
     * @param {string}              [resource.expectedDate]
     * @param {string}              [resource.receivedDate]
     * @param {string}              resource.status
     * @param {string}              [resource.currency]
     * @param {string}              [resource.description]
     * @param {Object[]}            [resource.details=[]]
     * @returns {PurchaseOrder}
     */
    static toEntityFromResource(resource) {
        const details = Array.isArray(resource.details)
            ? resource.details.map(detail => PurchaseOrderAssembler.toDetailEntityFromResource(detail))
            : [];

        return new PurchaseOrder({
            id:           resource.id           ?? null,
            businessId:   resource.businessId   ?? null,
            supplierId:   resource.supplierId   ?? null,
            supplierName: resource.supplierName ?? '',
            date:         resource.date         ?? '',
            expectedDate: resource.expectedDate ?? '',
            receivedDate: resource.receivedDate ?? '',
            status:       resource.status       ?? 'PENDING',
            currency:     resource.currency     ?? 'PEN',
            description:  resource.description  ?? '',
            details
        });
    }

    /**
     * Converts an array of raw purchase resource objects into PurchaseOrder entities.
     *
     * @param {import('axios').AxiosResponse} response
     * @returns {PurchaseOrder[]}
     */
    static toEntitiesFromResponse(response) {
        const dataArray = Array.isArray(response.data) ? response.data : [];
        return dataArray.map(resource => PurchaseOrderAssembler.toEntityFromResource(resource));
    }

    /**
     * Converts a single raw purchase-detail API resource into a PurchaseOrderDetail entity.
     *
     * @param {Object}      resource
     * @param {number}      resource.id
     * @param {number}      resource.purchaseId
     * @param {number}      resource.productId
     * @param {string}      [resource.productName]
     * @param {number}      resource.quantity
     * @param {number}      resource.unitPrice
     * @param {number}      [resource.discount]
     * @param {string}      [resource.deliveryStatus]
     * @param {string}      [resource.deliveryTrackingNum]
     * @returns {PurchaseOrderDetail}
     */
    static toDetailEntityFromResource(resource) {
        return new PurchaseOrderDetail({
            id:                  resource.id                  ?? null,
            purchaseId:          resource.purchaseId          ?? null,
            productId:           resource.productId           ?? null,
            productName:         resource.productName         ?? '',
            quantity:            resource.quantity            ?? 1,
            unitPrice:           resource.unitPrice           ?? 0,
            discount:            resource.discount            ?? 0,
            deliveryStatus:      resource.deliveryStatus      ?? '',
            deliveryTrackingNum: resource.deliveryTrackingNum ?? ''
        });
    }

    /**
     * Converts a PurchaseOrder entity into a plain resource object for API persistence.
     *
     * @param {PurchaseOrder} entity
     * @returns {Object}
     */
    static toResourceFromEntity(entity) {
        return {
            id:           entity.id,
            businessId:   entity.businessId,
            supplierId:   entity.supplierId,
            date:         entity.date,
            expectedDate: entity.expectedDate,
            receivedDate: entity.receivedDate,
            status:       entity.status,
            currency:     entity.currency,
            description:  entity.description
        };
    }

    /**
     * Converts a PurchaseOrderDetail entity into a plain resource object for API persistence.
     *
     * @param {PurchaseOrderDetail} detail
     * @returns {Object}
     */
    static toDetailResourceFromEntity(detail) {
        return {
            id:                  detail.id,
            purchaseId:          detail.purchaseId,
            productId:           detail.productId,
            quantity:            detail.quantity,
            unitPrice:           detail.unitPrice,
            discount:            detail.discount,
            deliveryStatus:      detail.deliveryStatus,
            deliveryTrackingNum: detail.deliveryTrackingNum
        };
    }
}
